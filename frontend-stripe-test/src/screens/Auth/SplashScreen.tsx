import React, { useEffect } from "react";
import BrandSplash from "../../components/BrandSplash";

interface SplashScreenProps {
  onReady: () => void;
}

export default function SplashScreen({ onReady }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onReady, 600);
    return () => clearTimeout(timer);
  }, [onReady]);

  return <BrandSplash status="Preparando tu experiencia" />;
}
