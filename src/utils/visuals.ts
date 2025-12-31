import GameOfLife from "../lib/GameOfLife";
import ParticleAttractor from "../lib/ParticleAttractor";
import NetworkGraph from "../lib/NetworkGraph";

export type VisualInstance = GameOfLife | ParticleAttractor | NetworkGraph;

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
