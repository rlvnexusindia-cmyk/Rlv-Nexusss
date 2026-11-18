const MARATHI_KEYWORDS = [
  'marathi',
  'lavani',
  'koligeet',
  'koliwada',
  'powada',
  'abhang',
  'bhavgeet',
  'sairat',
  'zingaat',
  'jhingat',
  'yad lagla',
  'ajay-atul',
  'ajay atul',
  'ajay gogavale',
  'atul gogavale',
  'adarsh shinde',
  'anand shinde',
  'utkarsh shinde',
  'pralhad shinde',
  'avadhoot gupte',
  'swapnil bandodkar',
  'vaishali samant',
  'bela shende',
  'rohit raut',
  'juilee joglekar',
  'mugdha karhade',
  'arya ambekar',
  'sanju rathod',
  'gulabi sadi',
  'tambdi chambdi',
  'kratex',
  'shreyas sagvekar',
  'apsara aali',
  'vajle ki bara',
  'natrang',
  'natarang',
  'lai bhaari',
  'mauli mauli',
  'duniyadari',
  'timepass',
  'mitwaa',
  'chandramukhi',
  'baipan bhari',
  'ved tuza',
  'shantabai',
  'kombdi palali',
  'govyachya kinaryav',
  'kombadi palali',
  'navrai majhi',
  'morya morya',
  'hi poli sajuk tupatli',
  'bugadi majhi',
  'bring it on marathi',
  'puneri dhol',
  'maharashtrachi',
];

export function containsMarathiMarker(text: string): boolean {
  const lower = text.toLowerCase();
  return MARATHI_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isMarathiTrackMeta(track: {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
}): boolean {
  const combined = `${track.title ?? ''} ${track.artist ?? ''} ${track.album ?? ''} ${track.genre ?? ''}`;
  return containsMarathiMarker(combined);
}
