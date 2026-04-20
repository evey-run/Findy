import { useState } from 'react';
import { Bars3Icon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

const NAV_ITEMS = ['Home', 'Services', 'Reviews', 'Contact us'];

export default function HeroLanding() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full min-h-screen w-full object-cover"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260210_031346_d87182fb-b0af-4273-84d1-c6fd17d6bf0f.mp4"
      />

      <nav className="relative z-20 w-full bg-transparent px-6 py-[16px] md:px-[120px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="h-7 w-7" fill="none" aria-label="Logo">
              <path d="M1.04356 6.35771L13.6437 0.666504..." fill="white" />
            </svg>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                className="font-['Manrope'] text-[14px] font-medium text-white transition-opacity hover:opacity-80"
              >
                <span className="inline-flex items-center gap-1">
                  {item}
                  {item === 'Services' && <ChevronDownIcon className="h-4 w-4" />}
                </span>
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button className="rounded-[8px] border border-[#d4d4d4] bg-white px-5 py-2 font-['Manrope'] text-[14px] font-semibold text-[#171717]">
              Sign In
            </button>
            <button className="rounded-[8px] bg-[#7b39fc] px-5 py-2 font-['Manrope'] text-[14px] font-semibold text-[#fafafa] shadow-[0_4px_14px_rgba(123,57,252,0.35)]">
              Get Started
            </button>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-7 w-7 text-white" />
          </button>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 flex min-h-screen flex-col bg-black px-6 py-8">
          <div className="flex items-center justify-between">
            <svg viewBox="0 0 16 16" className="h-7 w-7" fill="none" aria-label="Logo">
              <path d="M1.04356 6.35771L13.6437 0.666504..." fill="white" />
            </svg>
            <button onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">
              <XMarkIcon className="h-7 w-7 text-white" />
            </button>
          </div>

          <div className="mt-12 flex flex-1 flex-col gap-7">
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                className="text-left font-['Manrope'] text-[24px] font-medium text-white"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <button className="rounded-[8px] border border-[#d4d4d4] bg-white px-5 py-3 font-['Manrope'] text-[14px] font-semibold text-[#171717]">
              Sign In
            </button>
            <button className="rounded-[8px] bg-[#7b39fc] px-5 py-3 font-['Manrope'] text-[14px] font-semibold text-[#fafafa] shadow-[0_4px_14px_rgba(123,57,252,0.35)]">
              Get Started
            </button>
          </div>
        </div>
      )}

      <main className="relative z-10 mt-32 flex min-h-[calc(100vh-128px)] flex-col items-center justify-center px-6 text-center md:px-8">
        <div className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-[rgba(164,132,215,0.5)] bg-[rgba(85,80,110,0.4)] px-2 backdrop-blur-md">
          <span className="rounded-[6px] bg-[#7b39fc] px-2 py-1 font-['Cabin'] text-[14px] font-medium text-white">
            New
          </span>
          <span className="pr-2 font-['Cabin'] text-[14px] font-medium text-white">
            Say Hello to Datacore v3.2
          </span>
        </div>

        <h1 className="mt-8 max-w-[1000px] font-['Instrument_Serif'] text-5xl leading-[1.1] text-white md:text-7xl lg:text-[96px]">
          Book your perfect stay instantly <span className="mx-2 italic">and</span> hassle-free
        </h1>

        <p className="mt-6 max-w-[662px] font-['Inter'] text-[18px] font-normal text-white/70">
          Discover handpicked hotels, resorts, and stays across your favorite destinations. Enjoy
          exclusive deals, fast booking, and 24/7 support.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <button className="rounded-[10px] bg-[#7b39fc] px-7 py-3 font-['Cabin'] text-[16px] font-medium text-white transition-colors hover:bg-[#8f58fd]">
            Book a Free Demo
          </button>
          <button className="rounded-[10px] bg-[#2b2344] px-7 py-3 font-['Cabin'] text-[16px] font-medium text-[#f6f7f9] transition-colors hover:bg-[#3a2f59]">
            Get Started Now
          </button>
        </div>
      </main>
    </div>
  );
}
