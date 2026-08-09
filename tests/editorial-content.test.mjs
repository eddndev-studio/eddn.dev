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

const siteCopyFiles = [
	"src/i18n/ui.ts",
	"src/i18n/trajectory.ts",
	"src/layouts/Layout.astro",
	"src/components/Header.astro",
	"src/components/Footer.astro",
	"src/components/GitHubLanguages.astro",
	"src/components/pages/LandingPage.astro",
	"src/pages/blog/[...page].astro",
	"src/pages/es/blog/[...page].astro",
	"src/pages/articles/[...page].astro",
	"src/pages/es/articles/[...page].astro",
	"src/pages/leetcode/[...page].astro",
	"src/pages/es/leetcode/[...page].astro",
	"src/pages/leetcode/[...slug].astro",
	"src/pages/es/leetcode/[...slug].astro",
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

test("English editorial links use the unprefixed default-locale routes", () => {
	const englishFiles = [
		...collectMarkdown("src/content/blog/en"),
		...collectMarkdown("src/content/articles/en"),
	];

	for (const file of englishFiles) {
		assert.doesNotMatch(read(file), /\]\(\/en\//, `${file} prefixes an English route`);
	}
});

test("site copy uses concrete language instead of canned portfolio claims", () => {
	const stalePhrases = [
		/ambitious products/i,
		/productos ambiciosos/i,
		/selected transmissions/i,
		/transmisiones seleccionadas/i,
		/proof of work/i,
		/evidencia de trabajo/i,
		/leaves a trace/i,
		/deja rastro/i,
		/polished estimates/i,
		/estimaciones bonitas/i,
		/where depth matters/i,
		/donde la profundidad importa/i,
		/undefined route/i,
		/ruta no definida/i,
		/best algorithms/i,
		/mejores algoritmos/i,
		/high-impact creative studio/i,
		/estudio creativo de alto impacto/i,
		/deep academic training/i,
		/formaci(?:o|ó)n acad(?:e|é)mica profunda/i,
		/technical evolution over the years/i,
		/evoluci(?:o|ó)n t(?:e|é)cnica a lo largo de los a(?:n|ñ)os/i,
		/driven by the creative vision/i,
		/impulsado por la visi(?:o|ó)n creativa/i,
		/blog chronicles/i,
		/pensamientos sobre software/i,
		/system deep-dives/i,
		/an(?:a|á)lisis de sistemas/i,
		/optimized solution for/i,
		/soluci(?:o|ó)n optimizada para/i,
	];

	for (const file of siteCopyFiles) {
		const content = read(file);
		for (const phrase of stalePhrases) {
			assert.doesNotMatch(content, phrase, `${file} contains ${phrase}`);
		}
	}
});

test("English and Spanish interface copy expose the same keys", async () => {
	const { ui } = await import("../src/i18n/ui.ts");
	assert.deepEqual(Object.keys(ui.en).sort(), Object.keys(ui.es).sort());
});

test("site copy identifies the work and content sections precisely", () => {
	const ui = read("src/i18n/ui.ts");
	const trajectory = read("src/i18n/trajectory.ts");

	assert.match(ui, /Compilers, backend systems and technical notes\./);
	assert.match(ui, /Compiladores, sistemas backend y notas t(?:e|é)cnicas\./);
	assert.match(ui, /TECHNICAL<br \/><span>ARTICLES\.<\/span>/);
	assert.match(ui, /ART(?:I|Í)CULOS<br \/><span>T(?:E|É)CNICOS\.<\/span>/);
	assert.doesNotMatch(ui, /Rust solutions?|soluci(?:o|ó)n en Rust/i);
	assert.match(trajectory, /compiler, runtime and tooling/i);
	assert.match(trajectory, /compilador, runtime y las herramientas/i);
});

test("GitHub language stats do not replace missing data with invented percentages", () => {
	const component = read("src/components/GitHubLanguages.astro");

	assert.doesNotMatch(component, /TypeScript[^\n]+percent:\s*45/);
	assert.doesNotMatch(component, /Rust[^\n]+percent:\s*30/);
	assert.match(component, /languages\.unavailable/);
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

	assert.match(english, /I'm sorry|I apologize/i);
	assert.match(spanish, /perd(?:o|ó)n|disculpa/i);
});

test("the private auction article documents the executable claim and its limits", () => {
	const englishPath = "src/content/articles/en/achronyme-private-auction-integration-test.md";
	const spanishPath = "src/content/articles/es/achronyme-private-auction-integration-test.md";
	const english = read(englishPath);
	const spanish = read(spanishPath);

	for (const article of [english, spanish]) {
		assert.match(
			article,
			/translationKey: "achronyme-private-auction-integration-test"/,
		);
		assert.match(article, /tilino-lab/);
		assert.match(article, /channel\(1\)/);
		assert.match(article, /--insecure-dev-setup/);
		assert.match(article, /2,501/);
		assert.match(article, /1,864/);
		assert.match(article, /proof\.json/);
		assert.match(article, /public\.json/);
		assert.match(article, /verification_key\.json/);
		assert.match(article, /receipt\.txt/);
		assert.match(article, /PROVE/);
		assert.match(article, /VERIFY/);
		assert.match(article, /CIRCOM/);
	}

	assert.match(english, /4 public inputs/i);
	assert.match(english, /9 witness values/i);
	assert.match(english, /fixed nonces/i);
	assert.match(english, /does not prove/i);
	assert.match(spanish, /4 entradas p(?:u|ú)blicas/i);
	assert.match(spanish, /9 valores testigo/i);
	assert.match(spanish, /nonces fijos/i);
	assert.match(spanish, /no demuestra/i);

	assert.match(
		read("src/content/blog/en/achronyme-0-1-0.md"),
		/\]\(\/articles\/achronyme-private-auction-integration-test\/\)/,
	);
	assert.match(
		read("src/content/blog/es/achronyme-0-1-0.md"),
		/\]\(\/es\/articles\/achronyme-private-auction-integration-test\/\)/,
	);
});
