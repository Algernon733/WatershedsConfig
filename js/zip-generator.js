export async function generateZip(configMetadata, currentValues) {
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not loaded');
    }

    const zip = new JSZip();
    const folder = zip.folder('Watersheds');

    // Generate each config file
    configMetadata.configs.forEach(config => {
        const configJson = buildConfigJson(config, currentValues[config.className]);
        const jsonString = JSON.stringify(configJson, null, 2);
        folder.file(config.fileName, jsonString);
    });

    // Generate and download the zip
    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });

    // Trigger download
    downloadBlob(blob, 'WatershedsConfig.zip');
}

function buildConfigJson(configMeta, values) {
    const result = {};

    configMeta.properties.forEach(prop => {
        if (prop.isNested && prop.nestedProperties) {
            // Build nested object
            result[prop.name] = {};
            const nestedValues = values[prop.name] || {};

            prop.nestedProperties.forEach(nestedProp => {
                const value = nestedValues[nestedProp.name];
                result[prop.name][nestedProp.name] = formatValueForJson(value, nestedProp.type);

                // Add description if present
                if (nestedProp.description) {
                    result[prop.name][nestedProp.name + 'Description'] = nestedProp.description;
                }
            });

            // Add description for the nested object itself if present
            if (prop.description) {
                result[prop.name + 'Description'] = prop.description;
            }
        } else {
            const value = values[prop.name];
            result[prop.name] = formatValueForJson(value, prop.type);

            // Add description if present
            if (prop.description) {
                result[prop.name + 'Description'] = prop.description;
            }
        }
    });

    return result;
}

function formatValueForJson(value, type) {
    if (value === null || value === undefined) {
        return getTypeDefault(type);
    }

    // Ensure correct types
    switch (type) {
        case 'int':
            return Math.round(Number(value));
        case 'float':
        case 'double':
            return Number(value);
        case 'bool':
            return Boolean(value);
        case 'string':
            return String(value);
        case 'float[]':
            if (Array.isArray(value)) {
                return value.map(v => Number(v));
            }
            return [];
        case 'int[]':
            if (Array.isArray(value)) {
                return value.map(v => Math.round(Number(v)));
            }
            return [];
        default:
            return value;
    }
}

function getTypeDefault(type) {
    switch (type) {
        case 'int': return 0;
        case 'float':
        case 'double': return 0.0;
        case 'bool': return false;
        case 'string': return '';
        case 'float[]':
        case 'int[]': return [];
        default: return null;
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
