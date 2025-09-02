import { useEffect, useState } from 'react';
import beaconCircuitBg from '../assets/beacon-circuit-bg.jpg';

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
      setTimeout(() => onComplete(), 500);
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background circuit-bg overflow-hidden">
      {/* Background circuit image */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url(${beaconCircuitBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Animated circuit overlay */}
      <svg 
        className="absolute inset-0 w-full h-full" 
        viewBox="0 0 1920 1080"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M200 200 L500 200 L500 400 L800 400 L800 600 L1200 600 L1200 300 L1600 300"
          stroke="hsl(var(--neon-blue))"
          strokeWidth="3"
          fill="none"
          strokeDasharray="10,5"
          className={isAnimating ? "animate-circuit-draw" : ""}
          style={{
            strokeDashoffset: isAnimating ? 1000 : 0,
            filter: 'drop-shadow(0 0 10px hsl(var(--neon-blue)))'
          }}
        />
        <path
          d="M300 800 L600 800 L600 500 L900 500 L900 700 L1300 700 L1300 400 L1500 400"
          stroke="hsl(var(--neon-green))"
          strokeWidth="3"
          fill="none"
          strokeDasharray="10,5"
          className={isAnimating ? "animate-circuit-draw" : ""}
          style={{
            strokeDashoffset: isAnimating ? 1000 : 0,
            animationDelay: '0.5s',
            filter: 'drop-shadow(0 0 10px hsl(var(--neon-green)))'
          }}
        />
      </svg>

      {/* Logo and loading animation */}
      <div className="relative z-10 text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold tracking-wider mb-4 animate-glow-pulse">
            BEACON
          </h1>
          <p className="text-lg text-muted-foreground">
            Navigate Nairobi
          </p>
        </div>

        {/* Tesla-inspired loading bars */}
        <div className="flex space-x-2 justify-center">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="tesla-loader"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/40" />
    </div>
  );
};

export default SplashScreen;