import { NextRequest, NextResponse } from "next/server";
import { getPerson, IMG } from "@/lib/tmdb";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const person = await getPerson(Number(id));

    const credits = person.combined_credits?.cast ?? [];

    // Popülerliğe göre sırala, dizi ve filmleri ayır
    const sorted = [...credits].sort(
      (a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0)
    );

    const map = (c: any) => ({
      type: c.media_type === "tv" ? "series" : "movie",
      tmdbId: c.id,
      titleTr: c.media_type === "tv" ? c.name : c.title,
      character: c.character ?? "",
      poster: IMG.poster(c.poster_path),
      year: (c.media_type === "tv" ? c.first_air_date : c.release_date)?.slice(0, 4) ?? null,
      tmdbRating: c.vote_average ? Number(c.vote_average.toFixed(1)) : null,
    });

    return NextResponse.json({
      ok: true,
      id: person.id,
      name: person.name,
      photo: IMG.profile(person.profile_path),
      biography: person.biography ?? "",
      birthday: person.birthday,
      placeOfBirth: person.place_of_birth,
      knownFor: person.known_for_department,

      series: sorted.filter((c: any) => c.media_type === "tv").map(map),
      movies: sorted.filter((c: any) => c.media_type === "movie").map(map),
    });
  } catch (err) {
    console.error("Kişi hatası:", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}