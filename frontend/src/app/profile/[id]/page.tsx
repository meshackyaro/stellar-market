import { Metadata } from "next";
import ProfileClient from "./ProfileClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

async function getProfile(id: string) {
  try {
    const res = await fetch(`${API_URL}/users/${id}`, {
      next: { revalidate: 60 } as RequestInit["next"],
    });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Error fetching profile for metadata:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const profile = await getProfile(params.id);

  if (!profile) {
    return {
      title: "Profile Not Found | StellarMarket",
      description: "The requested profile could not be found.",
    };
  }

  const title = `${profile.username} | StellarMarket`;
  const description =
    profile.bio?.substring(0, 160) ||
    `Check out ${profile.username}'s profile on StellarMarket.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
      type: "profile",
      username: profile.username,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function ProfilePage() {
  return <ProfileClient />;
}
