// ============================================================
// Central image map. Placeholder construction/infrastructure
// photos (Unsplash). To use your own later: drop files in
// public/images/ and replace the URLs below with /images/name.jpg
// ============================================================

const u = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`

export const IMAGES = {
  // Big hero / feature shots
  heroSite:      u('photo-1541888946425-d81bb19240f5'),
  aboutFeature:  u('photo-1503387762-592deb58ef4e'),
  contactBand:   u('photo-1590496793929-36417d3117de'),

  // Project photos (swap with your real project shots)
  nalcoSiding:   u('photo-1474487548417-781cb71495f3'),
  deltaWater:    u('photo-1581092160607-ee22621dd758'),
  highwayX20:    u('photo-1516216628859-9bccecab13ca'),
  techPark:      u('photo-1486406146926-c627a92ad1ab'),
  flyover:       u('photo-1449157291145-7efd050a4d0e'),
  logisticsHub:  u('photo-1587293852726-70cdb56c2866'),

  // Service category thumbnails
  roads:         u('photo-1545459720-aac8509eb02c', 800),
  bridges:       u('photo-1558618666-fcd25c85cd64', 800),
  railway:       u('photo-1474487548417-781cb71495f3', 800),
  urban:         u('photo-1486406146926-c627a92ad1ab', 800),

  // Timeline milestones
  tl2009:        u('photo-1503387762-592deb58ef4e', 900),
  tl2015:        u('photo-1486406146926-c627a92ad1ab', 900),
  tl2021:        u('photo-1466611653911-95081537e5b7', 900),
  tl2024:        u('photo-1449157291145-7efd050a4d0e', 900),

  // Gallery strip
  gallery1:      u('photo-1503387762-592deb58ef4e', 800),
  gallery2:      u('photo-1541888946425-d81bb19240f5', 800),
  gallery3:      u('photo-1516216628859-9bccecab13ca', 800),
  gallery4:      u('photo-1581092160607-ee22621dd758', 800),
}