import GameOfLife from "../lib/GameOfLife";
import ParticleAttractor from "../lib/ParticleAttractor";
import NetworkGraph from "../lib/NetworkGraph";

export type VisualInstance = GameOfLife | ParticleAttractor | NetworkGraph;

export function manageVisualMotion(
    canvas: HTMLCanvasElement,
    visual: VisualInstance,
): () => void {
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    let isVisible = false;

    const syncPlayback = () => {
        const shouldRun = isVisible && !document.hidden && !motionPreference.matches;
        if (shouldRun) {
            visual.start();
        } else {
            visual.stop();
        }
    };

    visual.init();
    visual.stop();

    const observer = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        syncPlayback();
    });

    observer.observe(canvas);
    document.addEventListener('visibilitychange', syncPlayback);
    motionPreference.addEventListener('change', syncPlayback);

    return () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', syncPlayback);
        motionPreference.removeEventListener('change', syncPlayback);
        visual.destroy();
    };
}

export function createRandomVisual(canvas: HTMLCanvasElement, color: string): VisualInstance {
    const rand = Math.random();
    if (rand < 0.33) {
        return new GameOfLife(canvas, color);
    } else if (rand < 0.66) {
        return new ParticleAttractor(canvas, color);
    } else {
        return new NetworkGraph(canvas, color);
    }
}
