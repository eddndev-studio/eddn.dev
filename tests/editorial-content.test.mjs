import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath) {
	return readFileSync(join(projectRoot, relativePath), "utf8");
}

function collectMarkdown(directory) {
	return readdirSync(join(projectRoot, directory), { withFileTypes: true })
		.flatMap((entry) => {
			const relativePath = join(directory, entry.name);
			return entry.isDirectory()
				? collectMarkdown(relativePath)
				: relativePath.endsWith(".md") ? [relativePath] : [];
		});
}

const editorialFiles = [
	...collectMarkdown("src/content/blog"),
	...collectMarkdown("src/content/articles"),
];

test("editorial writing avoids canned framing and decorative dashes", () => {
	const cannedPhrases = [
		/last year was a forge/i,
		/el a(?:n|ñ)o pasado fue una forja/i,
		/blank canvas/i,
		/lienzo en blanco/i,
		/at the end of the day/i,
		/al final del d(?:i|í)a/i,
		/fundamental paradigm shift/i,
		/cambio de paradigma fundamental/i,
		/fascinating intersection/i,
		/intersecci(?:o|ó)n fascinante/i,
		/revolutionary advance/i,
		/avance revolucionario/i,
		/if you take one thing from this article/i,
		/si te llevas algo de este art(?:i|í)culo/i,
	];

	for (const file of editorialFiles) {
		const content = read(file);
		assert.doesNotMatch(content, /[\u2013\u2014]/, `${file} uses a Unicode dash`);
		for (const phrase of cannedPhrases) {
			assert.doesNotMatch(content, phrase, `${file} contains ${phrase}`);
		}
	}
});

test("Achronyme setup claims distinguish automation from trust", () => {
	const achronymeFiles = editorialFiles.filter((file) =>
		file.includes("achronyme"),
	);

	for (const file of achronymeFiles) {
		assert.doesNotMatch(read(file), /\bzero ceremony\b|\bsin ceremonia\b/i);
	}
});

test("the stable 0.1.0 release story is complete in English and Spanish", () => {
	const english = read("src/content/blog/en/achronyme-0-1-0.md");
	const spanish = read("src/content/blog/es/achronyme-0-1-0.md");
	const articles = [english, spanish];

	for (const article of articles) {
		assert.match(article, /translationKey: "achronyme-0-1-0-stable"/);
		assert.match(article, /fd07b38e16256e2ed6a8f2b438d340a681c9b0ac/);
		assert.match(
			article,
			/https:\/\/github\.com\/achronyme\/achronyme\/releases\/tag\/v0\.1\.0/,
		);
		assert.match(
			article,
			/https:\/\/github\.com\/achronyme\/achronyme-editor\/releases\/tag\/v0\.3\.0/,
		);
		assert.match(article, /phase 2|fase 2/i);
		assert.match(article, /beacon/i);
		assert.match(article, /snarkjs/i);
	}

	assert.match(english, /I(?:'|’)m sorry|I apologize/i);
	assert.match(spanish, /perd(?:o|ó)n|disculpa/i);
});
