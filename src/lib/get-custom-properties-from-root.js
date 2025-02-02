import { promises as fs } from 'fs';
import path from 'path';
import postcss from 'postcss';
import {importCache} from "./import-cache";

// return custom selectors from the css root, conditionally removing them
export default async function getCustomPropertiesFromRoot(root) {
	// initialize custom selectors
	let customProperties = {};

	// resolve current file directory
	let sourceDir = __dirname;
	if (root.source && root.source.input && root.source.input.file) {
		sourceDir = path.dirname(root.source.input.file);
	}

	// recursively add custom properties from @import statements
	const importPromises = [];
	root.walkAtRules('import', atRule => {
		const fileName = atRule.params.replace(/['|"]/g, '');
		let resolvedFileName;

		if ((/^~/).test(fileName)) {
			resolvedFileName = require.resolve(fileName.replace(/^~/, ''));
		} else {
			resolvedFileName = path.resolve(sourceDir, fileName);
		}

		// if a cache doesn't exist, create it
		if (!importCache.has(resolvedFileName)) {
			importCache.set(resolvedFileName, getCustomPropertiesFromCSSFile(resolvedFileName));
		}

		// use the cached custom properties
		importPromises.push(importCache.get(resolvedFileName));
	});

	(await Promise.all(importPromises)).forEach(propertiesFromImport => {
		customProperties = Object.assign(customProperties, propertiesFromImport);
	});

	// for each custom property declaration
	root.walkDecls(customPropertyRegExp, decl => {
		const { prop } = decl;

		// write the parsed value to the custom property
		customProperties[prop] = decl.value;
	});

	// return all custom properties, preferring :root properties over html properties
	return customProperties;
}

// match custom properties
const customPropertyRegExp = /^--[A-z][\w-]*$/;


async function getCustomPropertiesFromCSSFile(from) {
	try {
		const css = await fs.readFile(from, 'utf8');
		const root = postcss.parse(css, { from });

		return await getCustomPropertiesFromRoot(root);
	} catch (e) {
		return {};
	}
}
