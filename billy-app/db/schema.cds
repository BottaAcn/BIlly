namespace billy;

entity Document {
  key ID    : UUID;
  title     : String;
  content   : LargeString;
  embedding : Vector(3072);
  createdAt : Timestamp @cds.on.insert: $now;
}
