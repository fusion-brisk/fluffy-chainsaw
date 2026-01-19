import React, { useEffect, useRef, memo } from 'react';

interface ConfettiProps {
  isActive: boolean;
  type: 'success' | 'error';
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  shape: 'rect' | 'circle' | 'star';
  opacity: number;
  life: number;
}

// Карамельные цвета для успеха
const SUCCESS_COLORS = [
  '#FFD700', // Золотой
  '#FF6B9D', // Розовый
  '#4ECDC4', // Бирюзовый
  '#A78BFA', // Лавандовый
  '#34D399', // Изумрудный
  '#F472B6', // Фуксия
  '#FBBF24', // Янтарный
  '#60A5FA', // Голубой
];

// Цвета для ошибки (более приглушённые)
const ERROR_COLORS = [
  '#EF4444', // Красный
  '#F97316', // Оранжевый
  '#FBBF24', // Жёлтый
  '#FB923C', // Персиковый
];

export const Confetti: React.FC<ConfettiProps> = memo(({ isActive, type, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (!isActive) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      particlesRef.current = [];
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Устанавливаем размер canvas
    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();

    const colors = type === 'success' ? SUCCESS_COLORS : ERROR_COLORS;
    // Reduced particle count for subtle effect
    const particleCount = type === 'success' ? 50 : 30;

    // Создаём частицы с 3D-эффектом
    const createParticles = () => {
      const particles: Particle[] = [];
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
        const velocity = 4 + Math.random() * 6; // Reduced velocity
        const shapes: ('rect' | 'circle' | 'star')[] = ['rect', 'circle', 'star'];

        particles.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * velocity * (0.5 + Math.random()),
          vy: Math.sin(angle) * velocity * (0.5 + Math.random()) - 3,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 4 + Math.random() * 6, // Smaller particles
          shape: shapes[Math.floor(Math.random() * shapes.length)],
          opacity: 1,
          life: 1,
        });
      }
      return particles;
    };

    particlesRef.current = createParticles();
    const startTime = Date.now();
    // Shorter duration for quicker fade
    const duration = type === 'success' ? 1500 : 1000;

    // Анимация
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (progress >= 1) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        particlesRef.current = [];
        onComplete?.();
        return;
      }

      for (const p of particlesRef.current) {
        // Физика с гравитацией
        p.vy += 0.3; // Гравитация
        p.vx *= 0.99; // Трение воздуха
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        
        // Затухание
        p.life = 1 - progress;
        p.opacity = p.life * (1 - Math.pow(progress, 2));

        // Отскок от краёв
        if (p.y > canvas.height - p.size) {
          p.y = canvas.height - p.size;
          p.vy *= -0.5;
          p.vx *= 0.8;
        }

        // Рисуем частицу с 3D-эффектом
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;

        // 3D-эффект через градиент
        const gradient = ctx.createLinearGradient(-p.size / 2, -p.size / 2, p.size / 2, p.size / 2);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(0.5, p.color);
        gradient.addColorStop(1, adjustColor(p.color, -30));

        ctx.fillStyle = gradient;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;

        if (p.shape === 'rect') {
          // Прямоугольник (конфетти)
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === 'circle') {
          // Круг
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Звезда
          drawStar(ctx, 0, 0, 5, p.size / 2, p.size / 4);
          ctx.fill();
        }

        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, type, onComplete]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
});

Confetti.displayName = 'Confetti';

// Вспомогательные функции
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    let x = cx + Math.cos(rot) * outerRadius;
    let y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

