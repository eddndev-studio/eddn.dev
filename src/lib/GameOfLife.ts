export default class GameOfLife {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private cellSize: number = 8;
    private cols: number = 0;
    private rows: number = 0;
    private grid: number[][] = [];
    private animationId: number | null = null;
    private color: string;

    constructor(canvas: HTMLCanvasElement, color: string = '#8b5cf6') {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get canvas context');
        this.ctx = context;
        this.color = color;
        
        // Initialize dimensions
        this.width = canvas.width;
        this.height = canvas.height;
        this.resize();

        // Bind methods
        this.loop = this.loop.bind(this);
        this.resize = this.resize.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
    }

    public init() {
        this.createGrid();
        this.seed();
        this.start();
        window.addEventListener('resize', this.resize);
        window.addEventListener('mousemove', this.handleMouseMove);
    }

    public destroy() {
        this.stop();
        window.removeEventListener('resize', this.resize);
        window.removeEventListener('mousemove', this.handleMouseMove);
    }

    private handleMouseMove(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        
        // Revive a small cluster around the cursor
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const c = (col + i + this.cols) % this.cols;
                const r = (row + j + this.rows) % this.rows;
                
                if (this.grid[c] && this.grid[c][r] !== undefined) {
                    // Add life with high probability
                    if (Math.random() > 0.3) {
                         this.grid[c][r] = 1;
                    }
                }
            }
        }
    }

    private resize() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
        
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        this.cols = Math.ceil(this.width / this.cellSize);
        this.rows = Math.ceil(this.height / this.cellSize);
        
        // Re-create grid while preserving some state if desired, or just reset
        this.createGrid();
        this.seed();
    }

    private createGrid() {
        this.grid = new Array(this.cols).fill(null)
            .map(() => new Array(this.rows).fill(0));
    }


    // Patterns definition
    private patterns = {
        glider: [
            [0, 1, 0],
            [0, 0, 1],
            [1, 1, 1]
        ],
        lwss: [
            [0, 1, 1, 1, 1],
            [1, 0, 0, 0, 1],
            [0, 0, 0, 0, 1],
            [1, 0, 0, 1, 0]
        ],
        pulsar: [
            [0,0,1,1,1,0,0,0,1,1,1,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [0,0,1,1,1,0,0,0,1,1,1,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,1,1,1,0,0,0,1,1,1,0,0],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,1,1,1,0,0,0,1,1,1,0,0]
        ],
        block: [
            [1, 1],
            [1, 1]
        ],
        beehive: [
            [0, 1, 1, 0],
            [1, 0, 0, 1],
            [0, 1, 1, 0]
        ]
    };

    private seed() {
        // Random seed
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                // 15% chance of being alive initially for a sparse, elegant look
                this.grid[i][j] = Math.random() < 0.15 ? 1 : 0;
            }
        }
    }

    private placePattern(x: number, y: number, pattern: number[][]) {
        for (let i = 0; i < pattern.length; i++) {
            for (let j = 0; j < pattern[i].length; j++) {
                if (x + i < this.cols && y + j < this.rows) {
                    this.grid[x + i][y + j] = pattern[i][j];
                }
            }
        }
    }

    private draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = this.color;
        
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                if (this.grid[i][j] === 1) {
                    // Draw rounded rects or circles for a cleaner look? 
                    // Let's stick to pixels for performance but maybe with some opacity
                    this.ctx.globalAlpha = 0.4; // Semi-transparent
                    this.ctx.fillRect(
                        i * this.cellSize, 
                        j * this.cellSize, 
                        this.cellSize - 1, // -1 for a tiny gap 
                        this.cellSize - 1
                    );
                }
            }
        }
        this.ctx.globalAlpha = 1.0;
    }

    private update() {
        const next = this.grid.map(arr => [...arr]);

        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                const state = this.grid[i][j];
                
                // Count live neighbors
                let neighbors = 0;
                for (let x = -1; x < 2; x++) {
                    for (let y = -1; y < 2; y++) {
                        if (x === 0 && y === 0) continue;
                        
                        const col = (i + x + this.cols) % this.cols;
                        const row = (j + y + this.rows) % this.rows;
                        
                        neighbors += this.grid[col][row];
                    }
                }

                // Conway's Rules
                if (state === 0 && neighbors === 3) {
                    next[i][j] = 1;
                } else if (state === 1 && (neighbors < 2 || neighbors > 3)) {
                    next[i][j] = 0;
                } else {
                    next[i][j] = state;
                }
            }
        }

        this.grid = next;
    }

    private loop() {
        // Throttle simulation speed slightly if needed, but RAF is usually fine
        // For a more "cinematic" feel, we might skip frames, but let's run smooth first
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(this.loop);
    }

    public start() {
        if (!this.animationId) {
            this.loop();
        }
    }

    public stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}
