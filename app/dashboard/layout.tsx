import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";

export const metadata: Metadata = {
  title: "Dashboard | Citizen Projects",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <nav className="sticky top-0 z-50 h-16 border-b border-slate-200 bg-white">
        <div className="flex h-full w-full items-center justify-between px-4 sm:px-6">
          <Link
            href="/dashboard"
            aria-label="Citizen Projects dashboard"
            className="inline-flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-700"
          >
            <Image
              src="/logo.png"
              alt="Citizen Projects"
              width={160}
              height={40}
              priority
              className="h-10 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="https://www.citizenprojects.in"
              target="_blank"
              rel="noreferrer"
              className="mr-1 rounded-md px-2 py-2 text-sm font-medium text-green-800 hover:bg-green-50 hover:underline sm:mr-2 sm:px-3"
            >
              www.citizenprojects.in
            </a>
            <NotificationBell />
            <ProfileMenu />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
