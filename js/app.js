import { renderConfigSection } from './config-renderer.js';
import { generateZip } from './zip-generator.js';

let configMetadata = null;
let configManifest = null;
let currentValues = {};
let defaultValues = {};
let presetCategories = [];
let categorySelections = {};

async function init() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const containerEl = document.getElementById('config-container');
    const actionsEl = document.getElementById('actions');

    try {
        // Load both JSON files in parallel, cache-bust to ensure fresh data
        const cacheBust = `?t=${Date.now()}`;
        const [metadataResponse, manifestResponse] = await Promise.all([
            fetch(`data/config-metadata.json${cacheBust}`),
            fetch(`data/config-manifest.json${cacheBust}`)
        ]);

        if (!metadataResponse.ok) {
            throw new Error('Failed to load config-metadata.json');
        }
        if (!manifestResponse.ok) {
            throw new Error('Failed to load config-manifest.json');
        }

        configMetadata = await metadataResponse.json();
        configManifest = await manifestResponse.json();

        presetCategories = configMetadata.presetCategories || [];

        // Clean up old single-preset localStorage key
        localStorage.removeItem('selectedPreset');

        // Initialize base defaults from metadata
        initializeDefaults();

        // Restore saved selections per category and apply all overrides
        presetCategories.forEach(category => {
            const saved = localStorage.getItem(`preset_${category.name}`) || 'default';
            const option = category.options.find(o => o.name === saved);
            categorySelections[category.name] = option ? saved : 'default';
            if (!option && saved !== 'default') {
                localStorage.removeItem(`preset_${category.name}`);
            }
        });
        applyAllCategoryOverrides(defaultValues);
        applyAllCategoryOverrides(currentValues);

        // Build preset category dropdowns
        const presetBar = document.getElementById('preset-bar');
        if (presetCategories.length > 0) {
            presetCategories.forEach(category => {
                const row = document.createElement('div');
                row.className = 'preset-row';

                const label = document.createElement('label');
                label.textContent = category.displayName + ':';
                row.appendChild(label);

                const select = document.createElement('select');
                select.className = 'preset-select';
                select.dataset.category = category.name;
                select.autocomplete = 'off';

                const defaultOpt = document.createElement('option');
                defaultOpt.value = 'default';
                defaultOpt.textContent = 'Default';
                select.appendChild(defaultOpt);

                category.options.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.name;
                    opt.textContent = option.displayName;
                    select.appendChild(opt);
                });

                select.value = categorySelections[category.name];
                select.addEventListener('change', e => switchCategory(category.name, e.target.value));
                row.appendChild(select);

                presetBar.appendChild(row);
            });
            presetBar.style.display = 'flex';
        }

        // Hide loading, show content
        loadingEl.style.display = 'none';
        actionsEl.style.display = 'flex';

        // Sort configs by order from manifest
        const sortedConfigs = configMetadata.configs
            .filter(config => {
                const manifestConfig = configManifest.configs[config.className];
                return manifestConfig && manifestConfig.visible !== false;
            })
            .sort((a, b) => {
                const orderA = configManifest.configs[a.className]?.order ?? 999;
                const orderB = configManifest.configs[b.className]?.order ?? 999;
                return orderA - orderB;
            });

        // Render each config section
        sortedConfigs.forEach(config => {
            const manifestConfig = configManifest.configs[config.className] || {};
            const section = renderConfigSection(config, manifestConfig, currentValues, onValueChange);
            containerEl.appendChild(section);
        });

        // Reset advanced toggle to off on every page load
        const showAdvancedCheckbox = document.getElementById('show-advanced');
        showAdvancedCheckbox.checked = false;
        document.body.classList.remove('show-advanced');

        // Event listeners
        document.getElementById('reset-all').addEventListener('click', resetAll);
        document.getElementById('download-config').addEventListener('click', downloadConfig);
        showAdvancedCheckbox.addEventListener('change', toggleAdvancedSettings);

    } catch (error) {
        console.error('Initialization error:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Error loading configuration: ${error.message}`;
    }
}

function initializeDefaults() {
    configMetadata.configs.forEach(config => {
        currentValues[config.className] = {};
        defaultValues[config.className] = {};

        config.properties.forEach(prop => {
            if (prop.isNested && prop.nestedProperties) {
                currentValues[config.className][prop.name] = {};
                defaultValues[config.className][prop.name] = {};

                prop.nestedProperties.forEach(nestedProp => {
                    const value = nestedProp.defaultValue;
                    currentValues[config.className][prop.name][nestedProp.name] = deepClone(value);
                    defaultValues[config.className][prop.name][nestedProp.name] = deepClone(value);
                });
            } else {
                const value = prop.defaultValue;
                currentValues[config.className][prop.name] = deepClone(value);
                defaultValues[config.className][prop.name] = deepClone(value);
            }
        });
    });
}

function applyPresetOverrides(overrides, targetValues) {
    for (const [className, classOverrides] of Object.entries(overrides)) {
        if (!targetValues[className]) continue;

        for (const [propName, propValue] of Object.entries(classOverrides)) {
            if (propValue !== null && typeof propValue === 'object' && !Array.isArray(propValue)) {
                // Nested property override — merge into the existing nested object
                if (!targetValues[className][propName]) {
                    targetValues[className][propName] = {};
                }
                for (const [nestedPropName, nestedValue] of Object.entries(propValue)) {
                    targetValues[className][propName][nestedPropName] = deepClone(nestedValue);
                }
            } else {
                // Direct property override
                targetValues[className][propName] = deepClone(propValue);
            }
        }
    }
}

function applyAllCategoryOverrides(targetValues) {
    presetCategories.forEach(category => {
        const selectedName = categorySelections[category.name];
        if (selectedName && selectedName !== 'default') {
            const option = category.options.find(o => o.name === selectedName);
            if (option) {
                applyPresetOverrides(option.overrides, targetValues);
            }
        }
    });
}

function switchCategory(categoryName, optionName) {
    categorySelections[categoryName] = optionName;
    localStorage.setItem(`preset_${categoryName}`, optionName);

    // Reset to base defaults then apply all category selections
    initializeDefaults();
    applyAllCategoryOverrides(defaultValues);
    applyAllCategoryOverrides(currentValues);

    // Update all inputs in place
    syncAllInputs();
}

function syncAllInputs() {
    configMetadata.configs.forEach(config => {
        config.properties.forEach(prop => {
            if (prop.isNested && prop.nestedProperties) {
                prop.nestedProperties.forEach(nestedProp => {
                    const value = currentValues[config.className][prop.name]?.[nestedProp.name];
                    const propPath = `${prop.name}.${nestedProp.name}`;
                    if (Array.isArray(value) && nestedProp.type !== 'string[]') {
                        value.forEach((item, index) => syncArrayInputAtIndex(config.className, propPath, index, item));
                    } else if (nestedProp.type === 'string[]' && Array.isArray(value)) {
                        syncInputs(config.className, propPath, value.join('\n'));
                    } else {
                        syncInputs(config.className, propPath, value);
                    }
                });
            } else {
                const value = currentValues[config.className][prop.name];
                if (Array.isArray(value) && prop.type !== 'string[]') {
                    value.forEach((item, index) => syncArrayInputAtIndex(config.className, prop.name, index, item));
                } else if (prop.type === 'string[]' && Array.isArray(value)) {
                    syncInputs(config.className, prop.name, value.join('\n'));
                } else {
                    syncInputs(config.className, prop.name, value);
                }
            }
        });
    });
}

function syncArrayInputAtIndex(configClass, propPath, index, value) {
    const dataPath = `${configClass}.${propPath}`;
    const inputs = document.querySelectorAll(`[data-config-path="${dataPath}"][data-array-index="${index}"]`);
    inputs.forEach(input => {
        input.value = value;
    });
}

function deepClone(value) {
    if (Array.isArray(value)) {
        return [...value];
    }
    if (value && typeof value === 'object') {
        return { ...value };
    }
    return value;
}

function onValueChange(configClass, propPath, value) {
    const parts = propPath.split('.');
    if (parts.length === 1) {
        currentValues[configClass][parts[0]] = value;
    } else if (parts.length === 2) {
        if (!currentValues[configClass][parts[0]]) {
            currentValues[configClass][parts[0]] = {};
        }
        currentValues[configClass][parts[0]][parts[1]] = value;
    }

    // Sync all inputs with the same config path
    syncInputs(configClass, propPath, value);
}

function syncInputs(configClass, propPath, value) {
    const dataPath = `${configClass}.${propPath}`;
    const inputs = document.querySelectorAll(`[data-config-path="${dataPath}"]`);

    inputs.forEach(input => {
        if (input.type === 'checkbox') {
            input.checked = value;
            // Also update the toggle text
            const toggleText = input.closest('.toggle-label')?.querySelector('.toggle-text');
            if (toggleText) {
                toggleText.textContent = value ? 'Enabled' : 'Disabled';
            }
        } else if (input.type === 'range') {
            input.value = value;
            // Also update the slider value display
            const valueDisplay = input.nextElementSibling;
            if (valueDisplay && valueDisplay.classList.contains('slider-value')) {
                valueDisplay.value = value;
            }
        } else if (input.hasAttribute('data-array-index')) {
            // Array inputs are synced separately
            return;
        } else {
            input.value = value;
        }
    });
}

function toggleAdvancedSettings(event) {
    if (event.target.checked) {
        document.body.classList.add('show-advanced');
    } else {
        document.body.classList.remove('show-advanced');
    }
}

function resetAll() {
    // Reset current values to a deep copy of the preset defaults
    configMetadata.configs.forEach(config => {
        config.properties.forEach(prop => {
            if (prop.isNested && prop.nestedProperties) {
                prop.nestedProperties.forEach(nestedProp => {
                    const defaultVal = defaultValues[config.className][prop.name][nestedProp.name];
                    currentValues[config.className][prop.name][nestedProp.name] = deepClone(defaultVal);
                });
            } else {
                const defaultVal = defaultValues[config.className][prop.name];
                currentValues[config.className][prop.name] = deepClone(defaultVal);
            }
        });
    });

    syncAllInputs();
}

async function downloadConfig() {
    try {
        await generateZip(configMetadata, currentValues);

        // Activate instructions (gray -> green)
        const instructionsEl = document.getElementById('download-instructions');
        instructionsEl.classList.remove('download-inactive');
        instructionsEl.classList.add('download-active');

        // Scroll to instructions
        document.getElementById('download-instructions').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Download error:', error);
        alert('Error generating config files: ' + error.message);
    }
}

// Expose the change handler for inline event handlers
window.configOnChange = onValueChange;

window.configArrayChange = function(configClass, propPath, index, value) {
    const parts = propPath.split('.');
    let arr;
    if (parts.length === 1) {
        arr = currentValues[configClass][parts[0]];
    } else {
        arr = currentValues[configClass][parts[0]][parts[1]];
    }

    if (Array.isArray(arr)) {
        arr[index] = value;
    }

    // Sync all array inputs with the same config path and index
    const dataPath = `${configClass}.${propPath}`;
    const inputs = document.querySelectorAll(`[data-config-path="${dataPath}"][data-array-index="${index}"]`);
    inputs.forEach(input => {
        input.value = value;
    });
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
