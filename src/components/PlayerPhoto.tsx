"use client";

import { useEffect, useState } from "react";
import { removeBlackBackdrop } from "@/lib/compress-photo-client";

type PlayerPhotoProps = {
  src: string;
  alt: string;
  className?: string;
};

export default function PlayerPhoto({ src, alt, className }: PlayerPhotoProps) {
  const [cleanSrc, setCleanSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    setCleanSrc("");
    void removeBlackBackdrop(src)
      .then((next) => {
        if (!cancelled) setCleanSrc(next);
      })
      .catch(() => {
        if (!cancelled) setCleanSrc(src);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!cleanSrc) {
    return <div className={`${className ?? ""} profile-photo-loading`} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cleanSrc} alt={alt} className={className} />
  );
}
