import React, { useEffect, useRef } from 'react';
import { AspectRatio } from '../types';
import { ASPECT_RATIOS } from '../constants';

interface VideoCanvasProps {
  aspectRatio: AspectRatio;
  onStreamReady?: (stream: MediaStream) => void;
  className?: string;
}

export const VideoCanvas: React.FC<VideoCanvasProps> = ({ aspectRatio, onStreamReady, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const startCamera = async () => {
      try {
        // Request high resolution to allow good cropping
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user"
          } 
        });
        
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Setup Canvas Stream when canvas is ready
  useEffect(() => {
    if (canvasRef.current && !canvasRef.current.captureStream) {
        // Some older browsers might not support it, but modern ones do.
        console.warn("Canvas captureStream not supported");
    } else if (canvasRef.current) {
        const canvasStream = canvasRef.current.captureStream(30); // 30 FPS
        if (onStreamReady) {
            onStreamReady(canvasStream);
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspectRatio]); // Re-emit stream if ratio changes potentially

  useEffect(() => {
    const draw = () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx || video.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const targetDim = ASPECT_RATIOS[aspectRatio];
      canvas.width = targetDim.width;
      canvas.height = targetDim.height;

      // Calculate crop (Center Crop: object-fit: cover equivalent)
      const videoRatio = video.videoWidth / video.videoHeight;
      const targetRatio = targetDim.width / targetDim.height;

      let sourceWidth, sourceHeight, sourceX, sourceY;

      if (videoRatio > targetRatio) {
        // Video is wider than target
        sourceHeight = video.videoHeight;
        sourceWidth = sourceHeight * targetRatio;
        sourceX = (video.videoWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        // Video is taller than target
        sourceWidth = video.videoWidth;
        sourceHeight = sourceWidth / targetRatio;
        sourceX = 0;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }

      // Flip horizontally for mirror effect
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(
        video,
        sourceX, sourceY, sourceWidth, sourceHeight,
        -canvas.width, 0, canvas.width, canvas.height
      );
      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [aspectRatio]);

  return (
    <div className={`relative bg-black overflow-hidden shadow-2xl ${className}`}>
      {/* Hidden Source Video */}
      <video ref={videoRef} className="hidden" playsInline muted />
      
      {/* Visible Canvas */}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full object-contain block"
      />
    </div>
  );
};
