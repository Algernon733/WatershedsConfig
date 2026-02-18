export function renderConfigSection(config, manifestConfig, values, onChange) {
    const section = document.createElement('div');
    let sectionClass = 'config-section';
    if (manifestConfig.advanced) {
        sectionClass += ' advanced';
    }
    section.className = sectionClass;

    // Header
    const header = document.createElement('div');
    header.className = 'config-header';

    const displayName = manifestConfig.displayName || config.displayName;
    const description = manifestConfig.description || config.description || '';
    const iconImage = manifestConfig.image || '';

    header.innerHTML = `
        ${iconImage ? `<img class="section-icon" src="${iconImage}" alt="">` : ''}
        <div class="info">
            <h2>${displayName}</h2>
            <p class="description">${description}</p>
        </div>
        <span class="toggle">+</span>
    `;

    // Content
    const content = document.createElement('div');
    content.className = 'config-content';

    // Check if this section uses compact nested layout
    const useCompactNested = manifestConfig.compactNestedLayout === true;

    // Filter and sort properties by manifest order, then render
    const sortedProperties = [...config.properties].sort((a, b) => {
        const orderA = manifestConfig.properties?.[a.name]?.order ?? 999;
        const orderB = manifestConfig.properties?.[b.name]?.order ?? 999;
        return orderA - orderB;
    });

    sortedProperties.forEach(prop => {
        const propManifest = manifestConfig.properties?.[prop.name] || {};
        if (propManifest.visible === false) return;

        const propEl = renderProperty(prop, propManifest, config.className, values, onChange, '', useCompactNested);
        content.appendChild(propEl);
    });

    // Toggle accordion
    header.addEventListener('click', () => {
        const isOpen = content.classList.toggle('open');
        section.classList.toggle('open', isOpen);
        header.querySelector('.toggle').textContent = isOpen ? '−' : '+';
    });

    section.appendChild(header);
    section.appendChild(content);
    return section;
}

function renderProperty(prop, propManifest, configClass, values, onChange, parentPath = '', useCompactNested = false) {
    const group = document.createElement('div');
    let className = prop.isNested ? 'property-group nested-config' : 'property-group';
    if (propManifest.advanced) {
        className += ' advanced';
    }
    group.className = className;

    const fullPath = parentPath ? `${parentPath}.${prop.name}` : prop.name;

    if (prop.isNested && prop.nestedProperties) {
        // Nested config section
        const nestedDescription = prop.description || '';
        group.innerHTML = `<h3>${formatPropertyName(prop.name)}</h3>${nestedDescription ? `<p class="nested-description">${nestedDescription}</p>` : ''}`;

        // Create a container for nested properties
        const nestedContainer = document.createElement('div');
        if (useCompactNested) {
            nestedContainer.className = 'nested-properties-grid';
        }

        // Sort properties to put "Enabled" first
        const sortedNestedProps = [...prop.nestedProperties].sort((a, b) => {
            if (a.name === 'Enabled')
                return -1;
            if (b.name === 'Enabled')
                return 1;
            return 0;
        });

        // Track if all visible properties are advanced
        let hasVisibleNonAdvanced = false;

        sortedNestedProps.forEach(nestedProp => {
            const nestedManifest = propManifest.properties?.[nestedProp.name] || {};
            if (nestedManifest.visible === false) return;

            if (!nestedManifest.advanced) {
                hasVisibleNonAdvanced = true;
            }

            const nestedEl = renderProperty(nestedProp, nestedManifest, configClass, values, onChange, prop.name, false);
            const hasImages = nestedManifest.images && nestedManifest.images.length > 0;
            if (useCompactNested && !hasImages) {
                nestedEl.classList.add('compact-property');
            }
            nestedContainer.appendChild(nestedEl);
        });

        // If all visible properties are advanced, mark the whole nested section as advanced
        if (!hasVisibleNonAdvanced) {
            group.classList.add('advanced');
        }

        group.appendChild(nestedContainer);
    } else {
        // Get current value
        let currentValue;
        if (parentPath) {
            currentValue = values[configClass]?.[parentPath]?.[prop.name];
        } else {
            currentValue = values[configClass]?.[prop.name];
        }

        // Fallback to default if undefined
        if (currentValue === undefined) {
            currentValue = prop.defaultValue;
        }

        const label = propManifest.displayName || formatPropertyName(prop.name);
        const description = prop.description || '';
        const defaultDisplay = formatDefaultValue(prop.defaultValue, prop.type);

        const imagesHtml = renderPropertyImages(propManifest.images);

        group.innerHTML = `
            <label>${label}</label>
            ${description ? `<p class="prop-description">${description}</p>` : ''}
            <div class="input-container">
                ${renderInput(prop, propManifest, configClass, fullPath, currentValue)}
            </div>
            <p class="default-value">Default: ${defaultDisplay}</p>
            ${imagesHtml}
        `;
    }

    return group;
}

function renderInput(prop, propManifest, configClass, path, currentValue) {
    const id = `${configClass}-${path.replace(/\./g, '-')}`;
    const inputType = propManifest.inputType || 'auto';

    switch (prop.type) {
        case 'bool':
            return renderBoolInput(id, configClass, path, currentValue);

        case 'int':
        case 'float':
        case 'double':
            if (inputType === 'slider' && propManifest.min !== undefined && propManifest.max !== undefined) {
                return renderSliderInput(id, configClass, path, currentValue, prop.type, propManifest);
            }
            return renderNumberInput(id, configClass, path, currentValue, prop.type);

        case 'float[]':
        case 'int[]':
            return renderArrayInput(id, configClass, path, currentValue, prop.type);

        case 'string':
            return renderTextInput(id, configClass, path, currentValue);

        default:
            return renderTextInput(id, configClass, path, String(currentValue ?? ''));
    }
}

function renderBoolInput(id, configClass, path, currentValue) {
    const checked = currentValue ? 'checked' : '';
    const dataPath = `${configClass}.${path}`;
    return `
        <label class="toggle-label">
            <label class="toggle-switch">
                <input type="checkbox" id="${id}" ${checked} data-config-path="${dataPath}"
                    onchange="this.parentElement.nextElementSibling.textContent = this.checked ? 'Enabled' : 'Disabled'; window.configOnChange('${configClass}', '${path}', this.checked)">
                <span class="toggle-slider"></span>
            </label>
            <span class="toggle-text">${currentValue ? 'Enabled' : 'Disabled'}</span>
        </label>
    `;
}

function renderNumberInput(id, configClass, path, currentValue, type) {
    const step = type === 'int' ? '1' : '0.01';
    const value = currentValue ?? 0;
    const dataPath = `${configClass}.${path}`;
    return `
        <input type="number" id="${id}" value="${value}" step="${step}" data-config-path="${dataPath}"
            onchange="window.configOnChange('${configClass}', '${path}', ${type === 'int' ? 'parseInt(this.value)' : 'parseFloat(this.value)'})">
    `;
}

function renderSliderInput(id, configClass, path, currentValue, type, manifest) {
    const min = manifest.min ?? 0;
    const max = manifest.max ?? 100;
    const step = manifest.step ?? (type === 'int' ? 1 : 0.01);
    const value = currentValue ?? min;
    const parseFunc = type === 'int' ? 'parseInt(this.value)' : 'parseFloat(this.value)';
    const dataPath = `${configClass}.${path}`;

    return `
        <div class="slider-container">
            <input type="range" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}" data-config-path="${dataPath}"
                oninput="this.nextElementSibling.value = this.value; window.configOnChange('${configClass}', '${path}', ${parseFunc})">
            <input type="number" class="slider-value" value="${value}" min="${min}" max="${max}" step="${step}" data-config-path="${dataPath}"
                oninput="this.previousElementSibling.value = this.value; window.configOnChange('${configClass}', '${path}', ${parseFunc})">
        </div>
    `;
}

function renderArrayInput(id, configClass, path, currentValue, type) {
    const arr = Array.isArray(currentValue) ? currentValue : [];
    const elementType = type.replace('[]', '');
    const step = elementType === 'int' ? '1' : '0.01';
    const parseFunc = elementType === 'int' ? 'parseInt(this.value)' : 'parseFloat(this.value)';
    const dataPath = `${configClass}.${path}`;

    const inputs = arr.map((v, i) => `
        <div class="array-item">
            <input type="number" value="${v}" step="${step}" data-config-path="${dataPath}" data-array-index="${i}"
                onchange="window.configArrayChange('${configClass}', '${path}', ${i}, ${parseFunc})">
            <span class="array-label">[${i}]</span>
        </div>
    `).join('');

    return `<div class="array-input">${inputs}</div>`;
}

function renderTextInput(id, configClass, path, currentValue) {
    const value = currentValue ?? '';
    const dataPath = `${configClass}.${path}`;
    return `
        <input type="text" id="${id}" value="${escapeHtml(value)}" data-config-path="${dataPath}"
            onchange="window.configOnChange('${configClass}', '${path}', this.value)">
    `;
}

function renderPropertyImages(images) {
    if (!images || !Array.isArray(images) || images.length === 0) {
        return '';
    }

    // Determine sizing class based on image count
    let sizeClass = 'many-images';
    if (images.length === 1) {
        sizeClass = 'single-image';
    } else if (images.length === 2) {
        sizeClass = 'two-images';
    }

    const imageElements = images.map(img => {
        if (typeof img === 'string') {
            // Simple string URL
            return `<img src="${img}" alt="Property illustration" data-lightbox-desc="" onclick="window.openImageLightbox(this)">`;
        } else if (typeof img === 'object') {
            // Object with src and optional description
            const description = img.description || '';
            const encoded = description ? btoa(unescape(encodeURIComponent(description))) : '';
            const titleAttr = description ? `title="${escapeHtml(description)}"` : '';
            return `<img src="${img.src}" alt="${escapeHtml(description || 'Property illustration')}" ${titleAttr} data-lightbox-desc="${encoded}" onclick="window.openImageLightbox(this)">`;
        }
        return '';
    }).join('');

    return `<div class="property-images ${sizeClass}">${imageElements}</div>`;
}

// Initialize lightbox functionality
function initLightbox() {
    // Create lightbox element if it doesn't exist
    if (!document.getElementById('image-lightbox')) {
        const lightbox = document.createElement('div');
        lightbox.id = 'image-lightbox';
        lightbox.className = 'image-lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <img src="" alt="Enlarged image">
                <div class="lightbox-description"></div>
            </div>
        `;
        lightbox.addEventListener('click', () => {
            lightbox.classList.remove('active');
        });
        document.body.appendChild(lightbox);
    }
}

// Global function to open lightbox
window.openImageLightbox = function(imgElement) {
    const lightbox = document.getElementById('image-lightbox');
    if (lightbox) {
        lightbox.querySelector('img').src = imgElement.src;
        const encoded = imgElement.getAttribute('data-lightbox-desc') || '';
        const description = encoded ? decodeURIComponent(escape(atob(encoded))) : '';
        const descEl = lightbox.querySelector('.lightbox-description');
        if (description) {
            descEl.innerHTML = description;
            descEl.style.display = 'block';
        } else {
            descEl.style.display = 'none';
        }
        lightbox.classList.add('active');
    }
};

// Initialize lightbox when module loads
initLightbox();

function formatPropertyName(name) {
    // Insert spaces before uppercase letters
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

function formatDefaultValue(value, type) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (Array.isArray(value)) {
        if (value.length > 5) {
            return `[${value.slice(0, 3).join(', ')}, ... (${value.length} items)]`;
        }
        return `[${value.join(', ')}]`;
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        // Format floats nicely
        if (type === 'float' || type === 'double') {
            return value.toString();
        }
        return value.toString();
    }
    return String(value);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
