export function corsMiddleware(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, DELETE, POST");
  res.header("Access-Control-Allow-Headers", "Range, Content-Type");
  res.header(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges"
  );
  next();
} 