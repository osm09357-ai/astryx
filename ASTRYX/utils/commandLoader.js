const fs = require("fs");
const path = require("path");
const {
    printLoading,
    printSuccess,
    printInfo,
    printWarn: printWarning,
    printError,
} = require("./consoleLogger");

function getAllJsFiles(dir, skipSubcommandsDirs = false) {
    const files = [];

    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (skipSubcommandsDirs && entry.name === "subcommands") continue;
            if (entry.name === "music") continue;

            files.push(...getAllJsFiles(fullPath, skipSubcommandsDirs));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

function logFullError(relativePath, error) {
    printError(`Failed loading: ${relativePath}`);
    console.error(error.stack || error);
}

function loadSlashCommands(client, commandsPath) {
    printLoading("Command modules");

    const files = getAllJsFiles(commandsPath, true);

    let loaded = 0;
    let errors = [];

    for (const filePath of files) {
        const relativePath = path.relative(commandsPath, filePath);

        try {
            delete require.cache[require.resolve(filePath)];

            const command = require(filePath);

            if (command?.data && command?.execute) {
                client.commands.set(command.data.name, command);
                loaded++;
            }
        } catch (error) {
            errors.push(relativePath);
            logFullError(relativePath, error);
        }
    }

    printSuccess(`Command modules loaded (${loaded} commands)`);

    if (errors.length)
        printWarning(`Failed to load ${errors.length} command files`);

    return { loaded, errors };
}

function loadPrefixCommands(client, pCommandsPath) {
    printLoading("Prefix command modules");

    const files = getAllJsFiles(pCommandsPath);

    let loaded = 0;
    let skipped = 0;
    let errors = [];

    for (const filePath of files) {
        const relativePath = path.relative(pCommandsPath, filePath);

        const parts = relativePath.split(path.sep);

        if (parts.length > 2) continue;

        if (parts.length === 2) {
            const [dirName, fileName] = parts;

            const mainCommand = path.join(
                pCommandsPath,
                dirName,
                `${dirName}.js`
            );

            if (
                fs.existsSync(mainCommand) &&
                fileName !== `${dirName}.js`
            ) {
                continue;
            }
        }

        try {
            delete require.cache[require.resolve(filePath)];

            const command = require(filePath);

            if (command?.name && command?.execute) {
                client.prefixCommands.set(command.name, command);

                if (Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.prefixCommands.set(alias, command);
                    }
                }

                loaded++;
            } else {
                skipped++;
            }
        } catch (error) {
            errors.push(relativePath);
            logFullError(relativePath, error);
        }
    }

    printSuccess(`Prefix command modules loaded (${loaded} commands)`);

    if (skipped)
        printInfo(`Skipped ${skipped} invalid files`);

    if (errors.length)
        printWarning(`Failed to load ${errors.length} prefix command files`);

    return { loaded, skipped, errors };
}

function loadHybridCommands(client, hybridPath) {
    printLoading("Hybrid command modules");

    if (!fs.existsSync(hybridPath)) {
        printInfo("No hybrid directory found.");
        return { loaded: 0, errors: [] };
    }

    const dirs = fs
        .readdirSync(hybridPath, { withFileTypes: true })
        .filter((d) => d.isDirectory());

    let loaded = 0;
    let errors = [];

    for (const dir of dirs) {
        const filePath = path.join(hybridPath, dir.name, `${dir.name}.js`);

        if (!fs.existsSync(filePath)) continue;

        try {
            delete require.cache[require.resolve(filePath)];

            const command = require(filePath);

            if (command?.data && command?.execute) {
                client.commands.set(command.data.name, command);
                loaded++;
            }

            if (command?.name && command?.execute) {
                client.prefixCommands.set(command.name, command);

                if (Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.prefixCommands.set(alias, command);
                    }
                }
            }
        } catch (error) {
            errors.push(dir.name);
            logFullError(`${dir.name}/${dir.name}.js`, error);
        }
    }

    printSuccess(`Hybrid command modules loaded (${loaded} commands)`);

    if (errors.length)
        printWarning(`Failed to load ${errors.length} hybrid command files`);

    return { loaded, errors };
}

function clearCommandCache(basePath) {
    Object.keys(require.cache).forEach((key) => {
        if (
            key.includes(`${basePath}${path.sep}commands${path.sep}`) ||
            key.includes(`${basePath}${path.sep}pCommands${path.sep}`) ||
            key.includes(`${basePath}${path.sep}hybrid${path.sep}`)
        ) {
            delete require.cache[key];
        }
    });
}

function reloadAllCommands(client, basePath) {
    client.commands.clear();
    client.prefixCommands.clear();

    clearCommandCache(basePath);

    const slash = loadSlashCommands(
        client,
        path.join(basePath, "commands")
    );

    const prefix = loadPrefixCommands(
        client,
        path.join(basePath, "pCommands")
    );

    const hybrid = loadHybridCommands(
        client,
        path.join(basePath, "hybrid")
    );

    return {
        success: true,
        slash,
        prefix,
        hybrid,
    };
}

module.exports = {
    getAllJsFiles,
    loadSlashCommands,
    loadPrefixCommands,
    loadHybridCommands,
    clearCommandCache,
    reloadAllCommands,
};
