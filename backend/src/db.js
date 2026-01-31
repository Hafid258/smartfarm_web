import mongoose from "mongoose";

let cachedConn = globalThis.__mongooseConn;
let cachedPromise = globalThis.__mongoosePromise;

export async function connectDb(uri) {
  if (!uri) throw new Error("Missing MONGO_URI");

  if (cachedConn?.readyState === 1) return cachedConn;

  if (!cachedPromise) {
    cachedPromise = mongoose.connect(uri).then((m) => m.connection);
    globalThis.__mongoosePromise = cachedPromise;
  }

  cachedConn = await cachedPromise;
  globalThis.__mongooseConn = cachedConn;
  return cachedConn;
}
