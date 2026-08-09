import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function read(relativePath) {
	return readFileSync(join(projectRoot, relativePath), "utf8");
}

function collectFiles(directory, extension) {
	return readdirSync(join(projectRoot, directory), { withFileTypes: true })
		.flatMap((entry) => {
			const relativePath = join(directory, entry.name);
			return entry.isDirectory()
				? collectFiles(relativePath, extension)
				: relativePath.endsWith(extension) ? [relativePath] : [];
		});
}

test("navigation stays compact through tablet widths", () => {
	const header = read("src/components/Header.astro");

	assert.match(header, /data-nav-desktop[^>]+class="[^"]*hidden lg:flex/);
	assert.match(header, /data-nav-compact[^>]+class="[^"]*lg:hidden/);
	assert.match(header, /id="mobile-menu"[^>]+class="[^"]*lg:hidden/);
	assert.match(header, /aria-controls="mobile-menu"/);
});

test("compact navigation exposes one clear trigger", () => {
	const header = read("src/components/Header.astro");
	const compactNavigation = header.match(
		/data-nav-compact[\s\S]*?<\/div>\s*<\/nav>/,
	)?.[0];

	assert.ok(compactNavigation, "compact navigation markup is present");
	assert.equal(compactNavigation.match(/<button\b/g)?.length, 1);
	assert.doesNotMatch(compactNavigation, /search-trigger/);
});

test("display headlines use one sans-serif voice", () => {
	const displaySource = [
		...collectFiles("src", ".astro"),
		...collectFiles("src/i18n", ".ts"),
	].map(read).join("\n");

	assert.doesNotMatch(displaySource, /font-serif/);
	assert.doesNotMatch(read("src/styles/global.css"), /Instrument Serif/);
});

test("display titles keep a semibold weight across page transitions", () => {
	const astroSource = collectFiles("src", ".astro").map(read).join("\n");
	const pageTitles = astroSource.match(/<h1\b[^>]*>/gs) ?? [];
	const sharedTitles = astroSource.match(
		/<(?:h[1-3]|a)\b[^>]*transition:name=\{`title-\$\{[^}]+\}`\}[^>]*>/gs,
	) ?? [];

	assert.ok(pageTitles.length > 0, "page titles are present");
	assert.ok(sharedTitles.length > 0, "shared transition titles are present");
	pageTitles.forEach((title) => assert.match(title, /\bfont-semibold\b/));
	sharedTitles.forEach((title) => assert.match(title, /\bfont-semibold\b/));
});

test("content renders without automatic load or scroll reveals", () => {
	const astroSource = collectFiles("src", ".astro").map(read).join("\n");
	const layout = read("src/layouts/Layout.astro");
	const landing = read("src/components/pages/LandingPage.astro");
	const styles = read("src/styles/global.css");

	assert.doesNotMatch(astroSource, /data-page-header/);
	assert.doesNotMatch(layout, /applyStagger|animateContent|fade-up|slide-left/);
	assert.doesNotMatch(landing, /hero-seq|io-reveal|initReveals|IntersectionObserver/);
	assert.doesNotMatch(styles, /rise-in|clip-reveal|hero-seq|io-reveal/);
});

test("the home index is composed as rows instead of cards", () => {
	const landing = read("src/components/pages/LandingPage.astro");
	const rows = landing.match(/data-entry-row/g) ?? [];

	assert.equal(rows.length, 1, "one shared row renderer is used for all entries");
	assert.match(landing, /latestBlog/);
	assert.match(landing, /latestArticle/);
	assert.match(landing, /latestLeetCode/);
	assert.doesNotMatch(landing, /rounded-\[(?:2|calc\(2)/);
	assert.doesNotMatch(landing, /shadow-\[inset/);
});

test("the hero decoration is a kinetic SVG field rather than a canvas simulation", () => {
	const landing = read("src/components/pages/LandingPage.astro");
	const slot = landing.match(/<div\s+data-hero-slot[^>]*>/)?.[0];
	const section = landing.match(/<section\s+data-hero-section[^>]*>/)?.[0];
	const fieldPath = join(projectRoot, "src/components/KineticField.astro");
	const controller = read("src/lib/kinetic/KineticField.ts");

	assert.ok(existsSync(fieldPath), "kinetic field component is present");
	const field = read("src/components/KineticField.astro");
	const root = field.match(/<div\s+data-kinetic-field[^>]*>/)?.[0];

	assert.ok(root, "kinetic field root is present");
	assert.ok(slot, "home field slot is present");
	assert.ok(section, "home hero section is present");
	assert.doesNotMatch(root, /rounded|ring-|shadow-/);
	assert.doesNotMatch(slot, /border-|ring-|shadow-|bg-\[/);
	assert.doesNotMatch(section, /border-/);
	assert.doesNotMatch(section, /min-h-/);
	assert.match(slot, /-mt-24/);
	assert.match(slot, /sm:-mt-32/);
	assert.match(slot, /lg:-mt-40/);
	assert.match(slot, /max-h-/);
	assert.match(landing, /<KineticField\s+decorative\s*\/>/);
	assert.match(field, /\.is-decorative \.kinetic-stage/);
	assert.match(field, /-webkit-mask-image:/);
	assert.match(field, /mask-image:/);
	assert.match(field, /<svg[^>]+data-kinetic-svg[^>]+aria-hidden="true"/s);
	assert.match(field, /data-kinetic-row/);
	assert.match(field, /data-kinetic-column/);
	assert.match(field, /\.kinetic-field\s*{[^}]*opacity:\s*0;/s);
	assert.match(field, /\.kinetic-field\.is-ready\s*{[^}]*opacity:\s*1;/s);
	assert.match(field, /transition:\s*opacity 500ms/);
	assert.match(controller, /this\.revealFrameId = requestAnimationFrame/);
	assert.match(controller, /this\.root\.classList\.add\("is-ready"\)/);
	assert.doesNotMatch(field, /<canvas|HeroEngine|data-term-|<button|<pre/);
	assert.equal(existsSync(join(projectRoot, "src/components/HeroCanvas.astro")), false);
	assert.equal(existsSync(join(projectRoot, "src/lib/hero/HeroEngine.ts")), false);
});

test("the site surface has no grain overlay", () => {
	assert.doesNotMatch(read("src/styles/global.css"), /body::before\s*{/);
});

test("social and contact links live in the main hero content", () => {
	const landing = read("src/components/pages/LandingPage.astro");
	const links = landing.match(/<div\s+data-hero-links[\s\S]*?<\/div>/)?.[0];
	const socialLinksIndex = landing.indexOf("data-hero-socials");
	const fieldIndex = landing.indexOf("data-hero-slot");

	assert.ok(links, "hero links are present");
	assert.match(links, /data-email-cta/);
	assert.match(links, /data-hero-socials/);
	assert.ok(socialLinksIndex < fieldIndex, "social links render before the kinetic field");
	assert.doesNotMatch(landing, /signal-dot|rounded-full\s+bg-brand-/);
});

test("small interface type keeps a readable floor", () => {
	const components = collectFiles("src/components", ".astro").map(read).join("\n");
	const styles = read("src/styles/global.css");

	assert.doesNotMatch(components, /text-\[(?:8|9)px\]/);
	assert.match(styles, /--text-xs:\s*0\.8125rem/);
	assert.match(styles, /--text-sm:\s*0\.9375rem/);
	assert.match(styles, /--text-base:\s*1\.0625rem/);
});

test("colored data marks use cells and ticks instead of blue bubbles", () => {
	const contributions = [
		read("src/components/GitHubContributions.astro"),
		read("src/components/LeetCodeContributions.astro"),
	].join("\n");
	const languages = read("src/components/GitHubLanguages.astro");
	const filters = read("src/components/LeetCodeFilters.astro");

	assert.doesNotMatch(contributions, /(?:gh-cell|lc-cell)[^\n]*rounded-full/);
	assert.doesNotMatch(contributions, /w-3 h-3 rounded-full bg-brand-/);
	assert.doesNotMatch(languages, /size-2 rounded-full/);
	assert.doesNotMatch(filters, /h-1\.5 w-1\.5 rounded-full/);
});

test("the footer closes the page without a rounded card edge", () => {
	const footer = read("src/components/Footer.astro");

	assert.doesNotMatch(footer, /rounded-t-/);
});

test("changed interface files remain focused", () => {
	const files = [
		"src/components/Header.astro",
		"src/components/KineticField.astro",
		"src/components/Footer.astro",
		"src/components/pages/LandingPage.astro",
		"src/lib/kinetic/KineticField.ts",
	];

	for (const file of files) {
		const lines = read(file).split("\n").length;
		assert.ok(lines < 400, `${file} has ${lines} lines`);
	}
});
