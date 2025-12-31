export default class ParticleAttractor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private particles: Particle[] = [];
    private animationId: number | null = null;
    private color: string;
    private particleCount: number = 200; // Base count
    private mouse: { x: number; y: number } = { x: -1000, y: -1000 };

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
        this.resize(); // Sets up particles based on size
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
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
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
        
        // Adjust particle count based on area (performance heuristic)
        // Base: 400 particles for a 1000x1000 area roughly
        const area = this.width * this.height;
        this.particleCount = Math.min(600, Math.floor(area / 2000));
        
        this.createParticles();
    }

    private createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(new Particle(this.width, this.height));
        }
    }

    private draw() {
        // Trail effect: fade out existing pixels
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // Slow fade for longer trails
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Reset composition to draw new particles
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = this.color;
        
        this.particles.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    private update() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        this.particles.forEach(p => {
            // Physics: Attraction to center (Black Hole)
            const dx = centerX - p.x;
            const dy = centerY - p.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq);
            
            // Stronger Gravity force
            // F = G * m1 * m2 / r^2
            // We use a simplified version, clamping distance to avoid infinity
            const force = 1000 / (dist + 50); 
            const angle = Math.atan2(dy, dx);
            
            p.vx += Math.cos(angle) * force * 0.5; // Apply force
            p.vy += Math.sin(angle) * force * 0.5;
            
            // Removed artificial swirl addition. 
            // The initial velocity + gravity creates the orbit.

            // Mouse Repulsion (Interaction)
            const mdx = this.mouse.x - p.x;
            const mdy = this.mouse.y - p.y;
            const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (mDist < 200) {
                const repForce = (200 - mDist) * 0.05;
                p.vx -= (mdx / mDist) * repForce;
                p.vy -= (mdy / mDist) * repForce;
            }

            // Friction (Air resistance)
            // Keeps them from accelerating infinitely
            p.vx *= 0.95;
            p.vy *= 0.95;

            // Update position
            p.x += p.vx;
            p.y += p.vy;

            // Reset if sucked into the "event horizon" (too close to center)
            if (dist < 10) {
                p.reset(this.width, this.height);
            }
            
            // Reset if lost in space (too far)
            if (p.x < -200 || p.x > this.width + 200 || p.y < -200 || p.y > this.height + 200) {
                p.reset(this.width, this.height);
            }
        });
    }

    private loop() {
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

class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;

    constructor(w: number, h: number) {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.size = Math.random() * 2 + 1;
        this.reset(w, h);
        
        // Pre-warm position so they don't all start at edges
        this.x = Math.random() * w;
        this.y = Math.random() * h;
    }

    reset(w: number, h: number) {
        // Spawn at random edge or random position
        const angle = Math.random() * Math.PI * 2;
        // Spawn effectively "orbiting" at a distance
        const r = Math.min(w, h) / 2 + Math.random() * 50;
        
        this.x = w/2 + Math.cos(angle) * r;
        this.y = h/2 + Math.sin(angle) * r;
        
        // Initial orbital velocity
        // Tangent to the circle
        const speed = Math.random() * 2 + 1;
        this.vx = -Math.sin(angle) * speed;
        this.vy = Math.cos(angle) * speed;
    }
}
