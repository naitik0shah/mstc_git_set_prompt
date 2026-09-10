/* ============================================
   NEBULA STRIKE — Space Shooter Game Engine
   Vanilla JavaScript + Canvas + Web Audio API
   ============================================ */

'use strict';

// ============================================
// Configuration & Constants
// ============================================

const CONFIG = {
    // Canvas settings
    GAME_WIDTH: 800,
    GAME_HEIGHT: 600,
    
    // Player settings
    PLAYER_SPEED: 6,
    PLAYER_WIDTH: 40,
    PLAYER_HEIGHT: 40,
    PLAYER_MAX_HEALTH: 100,
    FIRE_RATE: 250,          // ms between shots (normal)
    RAPID_FIRE_RATE: 80,     // ms between shots (rapid fire)
    BULLET_SPEED: 8,
    BULLET_DAMAGE: 1,
    
    // Enemy settings
    ENEMY_SPAWN_BASE: 1500,  // Base spawn interval (ms)
    ENEMY_SPAWN_MIN: 300,    // Minimum spawn interval
    ENEMY_SPEED_BASE: 2,     // Base enemy speed
    
    // Power-up settings
    POWERUP_DROP_CHANCE: 0.15,  // 15% chance on enemy death
    POWERUP_DURATION: 8000,     // 8 seconds
    POWERUP_SPEED: 2,
    
    // Difficulty scaling
    LEVEL_THRESHOLD: 500,    // Score needed per level
    DIFFICULTY_MULTIPLIER: 1.2, // Speed/spawn increase per level
    
    // Colors
    COLORS: {
        player: '#00f0ff',
        playerGlow: 'rgba(0, 240, 255, 0.5)',
        bullet: '#00ff88',
        bulletGlow: 'rgba(0, 255, 136, 0.8)',
        shield: 'rgba(0, 240, 255, 0.3)',
        enemyBasic: '#ff6600',
        enemyFast: '#ff00aa',
        enemyTank: '#aa00ff',
        enemyBoss: '#ff2244',
        explosion: ['#ff6600', '#ffaa00', '#ff2244', '#ffff00'],
        powerups: {
            shield: '#00f0ff',
            rapid: '#ffcc00',
            double: '#ff00aa'
        }
    }
};

// Enemy type definitions
const ENEMY_TYPES = {
    basic: {
        width: 30,
        height: 30,
        health: 1,
        speed: 2,
        score: 10,
        color: CONFIG.COLORS.enemyBasic,
        shape: 'triangle'
    },
    fast: {
        width: 25,
        height: 25,
        health: 1,
        speed: 4,
        score: 20,
        color: CONFIG.COLORS.enemyFast,
        shape: 'dart'
    },
    tank: {
        width: 45,
        height: 45,
        health: 3,
        speed: 1.2,
        score: 50,
        color: CONFIG.COLORS.enemyTank,
        shape: 'hexagon'
    },
    boss: {
        width: 60,
        height: 60,
        health: 8,
        speed: 1,
        score: 200,
        color: CONFIG.COLORS.enemyBoss,
        shape: 'boss'
    }
};

// Power-up types
const POWERUP_TYPES = ['shield', 'rapid', 'double'];

// ============================================
// Audio Manager (Web Audio API)
// ============================================

class AudioManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.masterGain = null;
    }
    
    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.ctx) return;
        
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3; // 30% volume
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            console.log('Audio not supported');
        }
    }
    
    // Resume context if suspended (browser autoplay policy)
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : 0.3;
        }
        return this.muted;
    }
    
    // Generate shoot sound (laser zap)
    playShoot() {
        if (!this.ctx || this.muted) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + 0.1);
    }
    
    // Generate explosion sound (noise burst)
    playExplosion() {
        if (!this.ctx || this.muted) return;
        
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill with noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noise.start(this.ctx.currentTime);
    }
    
    // Generate power-up collection sound (ascending arpeggio)
    playPowerup() {
        if (!this.ctx || this.muted) return;
        
        const notes = [440, 554, 659, 880]; // A major arpeggio
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.masterGain);
            
            osc.frequency.value = freq;
            osc.type = 'sine';
            
            const startTime = this.ctx.currentTime + (i * 0.08);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
            
            osc.start(startTime);
            osc.stop(startTime + 0.25);
        });
    }
    
    // Generate game over sound (descending tone)
    playGameOver() {
        if (!this.ctx || this.muted) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 1);
        
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);
        
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + 1);
    }
    
    // Generate player hit sound
    playHit() {
        if (!this.ctx || this.muted) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + 0.2);
    }
}

// ============================================
// Game Entity Classes
// ============================================

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = CONFIG.PLAYER_WIDTH;
        this.height = CONFIG.PLAYER_HEIGHT;
        this.speed = CONFIG.PLAYER_SPEED;
        this.health = CONFIG.PLAYER_MAX_HEALTH;
        this.maxHealth = CONFIG.PLAYER_MAX_HEALTH;
        this.lastShot = 0;
        this.invulnerable = 0;  // Invulnerability frames after being hit
        this.shield = false;
        this.shieldTime = 0;
        this.rapidFire = false;
        this.rapidTime = 0;
        this.doubleScore = false;
        this.doubleTime = 0;
    }
    
    update(deltaTime, input) {
        // Movement
        if (input.left) this.x -= this.speed;
        if (input.right) this.x += this.speed;
        
        // Boundary constraints
        this.x = Math.max(this.width / 2, Math.min(CONFIG.GAME_WIDTH - this.width / 2, this.x));
        
        // Timers
        if (this.invulnerable > 0) this.invulnerable -= deltaTime;
        if (this.shield) {
            this.shieldTime -= deltaTime;
            if (this.shieldTime <= 0) this.shield = false;
        }
        if (this.rapidFire) {
            this.rapidTime -= deltaTime;
            if (this.rapidTime <= 0) this.rapidFire = false;
        }
        if (this.doubleScore) {
            this.doubleTime -= deltaTime;
            if (this.doubleTime <= 0) this.doubleScore = false;
        }
    }
    
    canShoot(now) {
        const rate = this.rapidFire ? CONFIG.RAPID_FIRE_RATE : CONFIG.FIRE_RATE;
        return now - this.lastShot >= rate;
    }
    
    shoot(now) {
        this.lastShot = now;
        return new Bullet(this.x, this.y - this.height / 2);
    }
    
    takeDamage(amount) {
        if (this.invulnerable > 0) return false;
        
        if (this.shield) {
            this.shield = false;  // Shield absorbs one hit
            this.invulnerable = 500;
            return false;
        }
        
        this.health -= amount;
        this.invulnerable = 1000;  // 1 second of invulnerability
        return true;
    }
    
    activatePowerup(type) {
        switch(type) {
            case 'shield':
                this.shield = true;
                this.shieldTime = CONFIG.POWERUP_DURATION;
                break;
            case 'rapid':
                this.rapidFire = true;
                this.rapidTime = CONFIG.POWERUP_DURATION;
                break;
            case 'double':
                this.doubleScore = true;
                this.doubleTime = CONFIG.POWERUP_DURATION;
                break;
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Invulnerability flicker
        if (this.invulnerable > 0 && Math.floor(this.invulnerable / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        // Draw spaceship (futuristic arrow shape)
        ctx.shadowBlur = 20;
        ctx.shadowColor = CONFIG.COLORS.player;
        ctx.fillStyle = CONFIG.COLORS.player;
        
        ctx.beginPath();
        ctx.moveTo(0, -this.height / 2);
        ctx.lineTo(this.width / 2, this.height / 2);
        ctx.lineTo(0, this.height / 3);
        ctx.lineTo(-this.width / 2, this.height / 2);
        ctx.closePath();
        ctx.fill();
        
        // Cockpit detail
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, -5, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Engine flame animation
        const flameHeight = 10 + Math.random() * 10;
        ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
        ctx.beginPath();
        ctx.moveTo(-8, this.height / 2);
        ctx.lineTo(0, this.height / 2 + flameHeight);
        ctx.lineTo(8, this.height / 2);
        ctx.closePath();
        ctx.fill();
        
        // Shield effect
        if (this.shield) {
            ctx.strokeStyle = CONFIG.COLORS.shield;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = CONFIG.COLORS.powerups.shield;
            ctx.beginPath();
            ctx.arc(0, 0, this.width, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 12;
        this.speed = CONFIG.BULLET_SPEED;
        this.damage = CONFIG.BULLET_DAMAGE;
        this.active = true;
    }
    
    update() {
        this.y -= this.speed;
        if (this.y < -20) this.active = false;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = CONFIG.COLORS.bullet;
        ctx.fillStyle = CONFIG.COLORS.bullet;
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        ctx.restore();
    }
    
    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
}

class Enemy {
    constructor(type, x, y, levelMultiplier = 1) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.x = x;
        this.y = y;
        this.width = this.config.width;
        this.height = this.config.height;
        this.health = this.config.health;
        this.maxHealth = this.config.health;
        this.speed = this.config.speed * levelMultiplier;
        this.score = this.config.score;
        this.active = true;
        this.wobble = Math.random() * Math.PI * 2;  // For movement variation
        this.wobbleSpeed = 0.05 + Math.random() * 0.05;
    }
    
    update() {
        this.y += this.speed;
        this.wobble += this.wobbleSpeed;
        
        // Slight horizontal wobble for visual interest
        if (this.type === 'fast') {
            this.x += Math.sin(this.wobble) * 2;
        }
        
        // Off screen check
        if (this.y > CONFIG.GAME_HEIGHT + 50) {
            this.active = false;
            return 'escaped';  // Signal that enemy reached bottom
        }
        return null;
    }
    
    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
            return true;  // Destroyed
        }
        return false;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.PI);  // Face downward
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.config.color;
        ctx.fillStyle = this.config.color;
        
        switch(this.config.shape) {
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(0, -this.height / 2);
                ctx.lineTo(this.width / 2, this.height / 2);
                ctx.lineTo(-this.width / 2, this.height / 2);
                ctx.closePath();
                ctx.fill();
                break;
                
            case 'dart':
                ctx.beginPath();
                ctx.moveTo(0, -this.height / 2);
                ctx.lineTo(this.width / 3, 0);
                ctx.lineTo(this.width / 2, this.height / 2);
                ctx.lineTo(0, this.height / 3);
                ctx.lineTo(-this.width / 2, this.height / 2);
                ctx.lineTo(-this.width / 3, 0);
                ctx.closePath();
                ctx.fill();
                break;
                
            case 'hexagon':
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i;
                    const x = Math.cos(angle) * this.width / 2;
                    const y = Math.sin(angle) * this.height / 2;
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                // Inner detail
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(0, 0, this.width / 4, 0, Math.PI * 2);
                ctx.fill();
                break;
                
            case 'boss':
                // Complex boss shape
                ctx.beginPath();
                ctx.moveTo(0, -this.height / 2);
                ctx.lineTo(this.width / 2, -this.height / 4);
                ctx.lineTo(this.width / 2, this.height / 4);
                ctx.lineTo(this.width / 4, this.height / 2);
                ctx.lineTo(-this.width / 4, this.height / 2);
                ctx.lineTo(-this.width / 2, this.height / 4);
                ctx.lineTo(-this.width / 2, -this.height / 4);
                ctx.closePath();
                ctx.fill();
                // Core
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(0, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                break;
        }
        
        // Health bar for damaged enemies
        if (this.health < this.maxHealth) {
            ctx.rotate(Math.PI);  // Rotate back for health bar
            const barWidth = this.width;
            const barHeight = 4;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(-barWidth / 2, -this.height / 2 - 10, barWidth, barHeight);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(-barWidth / 2, -this.height / 2 - 10, barWidth * (this.health / this.maxHealth), barHeight);
        }
        
        ctx.restore();
    }
    
    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;  // 'shield', 'rapid', or 'double'
        this.width = 25;
        this.height = 25;
        this.speed = CONFIG.POWERUP_SPEED;
        this.active = true;
        this.rotation = 0;
    }
    
    update() {
        this.y += this.speed;
        this.rotation += 0.05;
        if (this.y > CONFIG.GAME_HEIGHT + 30) this.active = false;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        const color = CONFIG.COLORS.powerups[this.type];
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        
        // Draw hexagonal container
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const x = Math.cos(angle) * this.width / 2;
            const y = Math.sin(angle) * this.height / 2;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Inner icon
        ctx.rotate(-this.rotation);  // Keep icon upright
        ctx.fillStyle = color;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const icons = { shield: '🛡', rapid: '⚡', double: '✨' };
        ctx.fillText(icons[this.type], 0, 0);
        
        ctx.restore();
    }
    
    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 8;
        this.speedY = (Math.random() - 0.5) * 8;
        this.life = 1.0;  // 1 to 0
        this.decay = 0.02 + Math.random() * 0.02;
    }
    
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedX *= 0.98;  // Friction
        this.speedY *= 0.98;
        this.life -= this.decay;
        return this.life > 0;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ============================================
// Main Game Class
// ============================================

class Game {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        
        // Game state
        this.state = 'menu';  // 'menu', 'playing', 'paused', 'gameover'
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('nebulaStrikeHighScore')) || 0;
        this.level = 1;
        this.kills = 0;
        
        // Entities
        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.powerups = [];
        this.particles = [];
        
        // Input handling
        this.keys = {};
        this.touchControls = { left: false, right: false, shoot: false };
        
        // Timing
        this.lastTime = 0;
        this.enemySpawnTimer = 0;
        this.animationId = null;
        
        // Audio
        this.audio = new AudioManager();
        
        // DOM elements
        this.ui = {
            score: document.getElementById('score'),
            highScore: document.getElementById('high-score'),
            healthBar: document.getElementById('health-bar'),
            healthText: document.getElementById('health-text'),
            level: document.getElementById('level-display'),
            hud: document.getElementById('hud'),
            startScreen: document.getElementById('start-screen'),
            pauseScreen: document.getElementById('pause-screen'),
            gameoverScreen: document.getElementById('gameover-screen'),
            finalScore: document.getElementById('final-score'),
            finalLevel: document.getElementById('final-level'),
            finalKills: document.getElementById('final-kills'),
            newRecord: document.getElementById('new-record'),
            menuHighScore: document.getElementById('menu-high-score'),
            mobileControls: document.getElementById('mobile-controls'),
            shieldIndicator: document.getElementById('shield-indicator'),
            rapidIndicator: document.getElementById('rapid-indicator'),
            doubleIndicator: document.getElementById('double-indicator'),
            powerupIndicators: document.getElementById('powerup-indicators')
        };
        
        this.init();
    }
    
    init() {
        // Set initial UI values
        this.ui.highScore.textContent = this.highScore;
        this.ui.menuHighScore.textContent = this.highScore;
        
        // Event listeners
        this.setupEventListeners();
        
        // Show mobile controls if on touch device
        if ('ontouchstart' in window) {
            this.ui.mobileControls.classList.remove('hidden');
        }
        
        // Start render loop (for menu background)
        this.loop();
    }
    
    setupEventListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            // Prevent scrolling on space/arrows
            if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
            
            // Pause toggle
            if (e.key.toLowerCase() === 'p' && (this.state === 'playing' || this.state === 'paused')) {
                this.togglePause();
            }
            
            // Restart
            if (e.key.toLowerCase() === 'r' && this.state === 'gameover') {
                this.startGame();
            }
            
            // Mute
            if (e.key.toLowerCase() === 'm') {
                this.toggleMute();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        
        // Buttons
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
        document.getElementById('pause-restart-btn').addEventListener('click', () => this.startGame());
        document.getElementById('gameover-restart-btn').addEventListener('click', () => this.startGame());
        document.getElementById('menu-btn').addEventListener('click', () => this.showMenu());
        document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());
        
        // Mobile controls
        this.setupTouchControls();
        
        // Resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    setupTouchControls() {
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const btnShoot = document.getElementById('btn-shoot');
        
        // Helper to bind touch events
        const bindTouch = (element, prop) => {
            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.touchControls[prop] = true;
            });
            element.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.touchControls[prop] = false;
            });
            element.addEventListener('touchcancel', () => {
                this.touchControls[prop] = false;
            });
        };
        
        bindTouch(btnLeft, 'left');
        bindTouch(btnRight, 'right');
        bindTouch(btnShoot, 'shoot');
    }
    
    resizeCanvas() {
        // Maintain aspect ratio while fitting screen
        const scale = Math.min(
            window.innerWidth / CONFIG.GAME_WIDTH,
            window.innerHeight / CONFIG.GAME_HEIGHT
        );
        
        this.canvas.width = CONFIG.GAME_WIDTH;
        this.canvas.height = CONFIG.GAME_HEIGHT;
        this.canvas.style.width = `${CONFIG.GAME_WIDTH * scale}px`;
        this.canvas.style.height = `${CONFIG.GAME_HEIGHT * scale}px`;
    }
    
    startGame() {
        // Initialize audio on first user interaction
        this.audio.init();
        this.audio.resume();
        
        // Reset game state
        this.state = 'playing';
        this.score = 0;
        this.level = 1;
        this.kills = 0;
        
        // Reset entities
        this.player = new Player(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT - 80);
        this.bullets = [];
        this.enemies = [];
        this.powerups = [];
        this.particles = [];
        this.enemySpawnTimer = 0;
        
        // Update UI
        this.updateUI();
        this.ui.startScreen.classList.add('hidden');
        this.ui.pauseScreen.classList.add('hidden');
        this.ui.gameoverScreen.classList.add('hidden');
        this.ui.hud.classList.remove('hidden');
        this.ui.powerupIndicators.classList.remove('hidden');
        
        // Reset indicators
        this.updatePowerupIndicators();
    }
    
    showMenu() {
        this.state = 'menu';
        this.ui.gameoverScreen.classList.add('hidden');
        this.ui.startScreen.classList.remove('hidden');
        this.ui.hud.classList.add('hidden');
        this.ui.powerupIndicators.classList.add('hidden');
        this.ui.menuHighScore.textContent = this.highScore;
    }
    
    togglePause() {
        if (this.state === 'playing') {
            this.state = 'paused';
            this.ui.pauseScreen.classList.remove('hidden');
        } else if (this.state === 'paused') {
            this.state = 'playing';
            this.ui.pauseScreen.classList.add('hidden');
            this.lastTime = performance.now();  // Reset delta time
        }
    }
    
    toggleMute() {
        const muted = this.audio.toggleMute();
        document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
    }
    
    gameOver() {
        this.state = 'gameover';
        this.audio.playGameOver();
        
        // Create massive explosion at player position
        this.createExplosion(this.player.x, this.player.y, 50);
        
        // Check for new high score
        const isNewRecord = this.score > this.highScore;
        if (isNewRecord) {
            this.highScore = this.score;
            localStorage.setItem('nebulaStrikeHighScore', this.highScore);
            this.ui.newRecord.classList.remove('hidden');
        } else {
            this.ui.newRecord.classList.add('hidden');
        }
        
        // Update game over screen
        this.ui.finalScore.textContent = this.score;
        this.ui.finalLevel.textContent = this.level;
        this.ui.finalKills.textContent = this.kills;
        this.ui.highScore.textContent = this.highScore;
        
        // Show screen after brief delay for explosion effect
        setTimeout(() => {
            this.ui.gameoverScreen.classList.remove('hidden');
            this.ui.hud.classList.add('hidden');
            this.ui.powerupIndicators.classList.add('hidden');
        }, 1000);
    }
    
    // ============================================
    // Game Loop
    // ============================================
    
    loop(currentTime = 0) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        if (this.state === 'playing') {
            this.update(deltaTime);
        }
        
        this.render();
        
        this.animationId = requestAnimationFrame((time) => this.loop(time));
    }
    
    update(deltaTime) {
        // Update player
        const input = {
            left: this.keys['arrowleft'] || this.keys['a'] || this.touchControls.left,
            right: this.keys['arrowright'] || this.keys['d'] || this.touchControls.right,
            shoot: this.keys[' '] || this.touchControls.shoot
        };
        
        this.player.update(deltaTime, input);
        
        // Shooting
        if (input.shoot && this.player.canShoot(currentTime)) {
            this.bullets.push(this.player.shoot(currentTime));
            this.audio.playShoot();
        }
        
        // Spawn enemies
        this.enemySpawnTimer += deltaTime;
        const spawnInterval = Math.max(
            CONFIG.ENEMY_SPAWN_MIN,
            CONFIG.ENEMY_SPAWN_BASE - (this.level * 100)
        );
        
        if (this.enemySpawnTimer >= spawnInterval) {
            this.spawnEnemy();
            this.enemySpawnTimer = 0;
        }
        
        // Update bullets
        this.bullets = this.bullets.filter(bullet => {
            bullet.update();
            return bullet.active && bullet.y > -20;
        });
        
        // Update enemies
        this.enemies = this.enemies.filter(enemy => {
            const result = enemy.update();
            
            // Check if enemy escaped
            if (result === 'escaped') {
                this.player.takeDamage(10);
                this.audio.playHit();
                this.updateUI();
                
                if (this.player.health <= 0) {
                    this.gameOver();
                }
                return false;
            }
            
            return enemy.active;
        });
        
        // Update powerups
        this.powerups = this.powerups.filter(powerup => {
            powerup.update();
            
            // Check collection
            if (this.checkCollision(powerup.getBounds(), this.player.getBounds())) {
                this.player.activatePowerup(powerup.type);
                this.audio.playPowerup();
                this.updatePowerupIndicators();
                this.createParticles(powerup.x, powerup.y, CONFIG.COLORS.powerups[powerup.type], 10);
                return false;
            }
            
            return powerup.active;
        });
        
        // Update particles
        this.particles = this.particles.filter(particle => particle.update());
        
        // Collision detection: Bullets vs Enemies
        this.checkBulletCollisions();
        
        // Collision detection: Enemies vs Player
        this.checkPlayerCollisions();
        
        // Level progression
        const newLevel = Math.floor(this.score / CONFIG.LEVEL_THRESHOLD) + 1;
        if (newLevel > this.level) {
            this.level = newLevel;
            this.updateUI();
            // Level up effect
            this.createParticles(this.player.x, this.player.y, '#ffffff', 20);
        }
        
        // Update powerup timers in UI
        this.updatePowerupIndicators();
    }
    
    spawnEnemy() {
        const x = Math.random() * (CONFIG.GAME_WIDTH - 60) + 30;
        const y = -30;
        
        // Determine enemy type based on level and randomness
        let type = 'basic';
        const rand = Math.random();
        
        if (this.level >= 3 && rand > 0.8) {
            type = 'tank';
        } else if (this.level >= 2 && rand > 0.6) {
            type = 'fast';
        }
        
        // Boss spawn every 5 levels
        if (this.level % 5 === 0 && Math.random() > 0.9) {
            type = 'boss';
        }
        
        const levelMultiplier = 1 + (this.level - 1) * 0.1;
        this.enemies.push(new Enemy(type, x, y, levelMultiplier));
    }
    
    checkBulletCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            let bulletRemoved = false;
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                
                if (this.checkCollision(bullet.getBounds(), enemy.getBounds())) {
                    // Remove bullet
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    
                    // Damage enemy
                    const destroyed = enemy.takeDamage(bullet.damage);
                    
                    if (destroyed) {
                        // Award points
                        const points = this.player.doubleScore ? enemy.score * 2 : enemy.score;
                        this.score += points;
                        this.kills++;
                        
                        // Effects
                        this.createExplosion(enemy.x, enemy.y, enemy.type === 'boss' ? 30 : 15);
                        this.audio.playExplosion();
                        
                        // Drop powerup chance
                        if (Math.random() < CONFIG.POWERUP_DROP_CHANCE) {
                            const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
                            this.powerups.push(new PowerUp(enemy.x, enemy.y, type));
                        }
                        
                        this.updateUI();
                    } else {
                        // Hit but not destroyed - small spark effect
                        this.createParticles(bullet.x, bullet.y, '#ffffff', 3);
                    }
                    
                    break;
                }
            }
            
            if (bulletRemoved) continue;
        }
    }
    
    checkPlayerCollisions() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            if (this.checkCollision(enemy.getBounds(), this.player.getBounds())) {
                // Remove enemy
                this.enemies.splice(i, 1);
                
                // Damage player
                const tookDamage = this.player.takeDamage(20);
                
                if (tookDamage) {
                    this.audio.playHit();
                    this.createExplosion(enemy.x, enemy.y, 10);
                    this.updateUI();
                    
                    if (this.player.health <= 0) {
                        this.gameOver();
                        return;
                    }
                } else if (this.player.shield) {
                    // Shield absorbed the hit
                    this.createParticles(enemy.x, enemy.y, CONFIG.COLORS.powerups.shield, 15);
                    this.updatePowerupIndicators();
                }
            }
        }
    }
    
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    createExplosion(x, y, count) {
        const colors = CONFIG.COLORS.explosion;
        for (let i = 0; i < count; i++) {
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.particles.push(new Particle(x, y, color));
        }
    }
    
    createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }
    
    updateUI() {
        this.ui.score.textContent = this.score;
        this.ui.highScore.textContent = Math.max(this.score, this.highScore);
        this.ui.level.textContent = `LEVEL ${this.level}`;
        
        const healthPercent = (this.player.health / this.player.maxHealth) * 100;
        this.ui.healthBar.style.width = `${healthPercent}%`;
        this.ui.healthText.textContent = Math.max(0, this.player.health);
        
        if (healthPercent <= 30) {
            this.ui.healthBar.classList.add('low');
        } else {
            this.ui.healthBar.classList.remove('low');
        }
    }
    
    updatePowerupIndicators() {
        this.ui.shieldIndicator.classList.toggle('hidden', !this.player?.shield);
        this.ui.rapidIndicator.classList.toggle('hidden', !this.player?.rapidFire);
        this.ui.doubleIndicator.classList.toggle('hidden', !this.player?.doubleScore);
    }
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw entities
        if (this.state === 'playing' || this.state === 'paused') {
            // Draw powerups (behind enemies)
            this.powerups.forEach(p => p.draw(this.ctx));
            
            // Draw enemies
            this.enemies.forEach(e => e.draw(this.ctx));
            
            // Draw bullets
            this.bullets.forEach(b => b.draw(this.ctx));
            
            // Draw player
            if (this.state === 'playing') {
                this.player.draw(this.ctx);
            }
            
            // Draw particles (on top)
            this.particles.forEach(p => p.draw(this.ctx));
        }
    }
}

// ============================================
// Initialize Game
// ============================================

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    
    // Expose to console for debugging (optional)
    window.game = game;
});