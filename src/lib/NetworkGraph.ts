export default class NetworkGraph {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private particles: Node[] = [];
    private animationId: number | null = null;
    private color: string;
    private particleCount: number = 60; // Fewer particles for a cleaner graph
    private mouse: { x: number; y: number } = { x: -1000, y: -1000 };
    private connectionDistance: number = 150;

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
        this.resize();
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
        
        // Adjust particle count based on area and screen type
        const area = this.width * this.height;
        const isMobile = this.width < 768;
        
        if (isMobile) {
            this.particleCount = Math.min(50, Math.floor(area / 10000));
            this.connectionDistance = 120;
        } else {
            // Higher density for desktop
            this.particleCount = Math.min(150, Math.floor(area / 6000));
            this.connectionDistance = 180;
        }
        
        if (this.particleCount < 20) this.particleCount = 20;
        
        this.createParticles();
    }

    private createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(new Node(this.width, this.height));
        }
    }

    private draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw connections first (behind nodes)
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i < this.particles.length; i++) {
            const p1 = this.particles[i];
            
            // Connect to other particles
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.connectionDistance) {
                    const opacity = 1 - (dist / this.connectionDistance);
                    this.ctx.strokeStyle = this.hexToRgba(this.color, opacity * 0.5);
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }

            // Connect to mouse
            const mdx = this.mouse.x - p1.x;
            const mdy = this.mouse.y - p1.y;
            const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
            
            if (mDist < this.connectionDistance + 50) {
                 const opacity = 1 - (mDist / (this.connectionDistance + 50));
                 this.ctx.strokeStyle = this.hexToRgba(this.color, opacity * 0.8);
                 this.ctx.beginPath();
                 this.ctx.moveTo(p1.x, p1.y);
                 this.ctx.lineTo(this.mouse.x, this.mouse.y);
                 this.ctx.stroke();
            }
        }

        // Draw nodes
        this.ctx.fillStyle = this.color;
        this.particles.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    private update() {
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            // Bounce off edges
            if (p.x < 0 || p.x > this.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.height) p.vy *= -1;
            
            // Gentle mouse repulsion/attraction? Let's keep it simple: just connections
        });
    }

    private loop() {
        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(this.loop);
    }

    private hexToRgba(hex: string, alpha: number) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

class Node {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;

    constructor(w: number, h: number) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        
        const speed = 0.5;
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
        
        this.size = Math.random() * 2 + 1.5;
    }
}
