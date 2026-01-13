# eddn.dev

![Build Status](https://img.shields.io/github/actions/workflow/status/eddndev/eddn/deploy.yml?branch=master&label=build)
![Astro](https://img.shields.io/badge/framework-Astro_v5-orange)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![License](https://img.shields.io/github/license/eddndev/eddn)

## Overview

This repository, identified as `eddn` to differentiate it from enterprise-level configurations, serves as the technical foundation for **eddn.dev**. It is designed as a personal engineering environment focused on documenting software architecture, algorithmic problem-solving, and system reflections.

## Purpose and Engineering Goals

The primary objective of this project is to maintain a high-performance, low-latency platform for technical writing and experimentation. Unlike traditional portfolios, this system prioritizes:

*   **Static Site Excellence:** Utilizing Astro v5 to achieve near-zero client-side JavaScript for content delivery, leveraging SSG (Static Site Generation) for optimal edge distribution.
*   **Custom Simulation Engines:** Implementation of raw HTML5 Canvas simulations (`src/lib/`) for visual components, avoiding heavy abstraction layers to maintain direct control over memory and the render loop.
*   **Structured Content Engineering:** Using strict TypeScript schemas via Astro Content Collections to manage algorithmic documentation (LeetCode) and technical articles, ensuring metadata integrity and type safety across the entire build.
*   **Seamless Interactivity:** Integration of GSAP for orchestrating complex entrance sequences and Lenis for unified scroll behavior, balanced against the performance requirements of a static site.
*   **Internationalization Logic:** A robust i18n implementation that handles localized content discovery and SEO-compliant cross-linking via structured sitemaps and hreflang orchestration.

## Tech Stack

*   **Framework:** Astro v5 (SSG)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS v4 (Vite-integrated)
*   **Animations:** GSAP + ScrollTrigger
*   **Smooth Scrolling:** Lenis
*   **Content:** Markdown/MDX with Shiki-based syntax highlighting

## License

GPLv3
