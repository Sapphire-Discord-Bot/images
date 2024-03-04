const fg             = require("fast-glob"),
      fs             = require("fs/promises"),
      path           = require("path"),
      checkDiskSpace = require("check-disk-space").default;

const utils = require("./utils.js");

const allowedOrigins = new Set(process.env.ALLOWED_ORIGINS?.split?.(",") || []);

exports.run = () => {

 let resolvePromise, promise = new Promise((resolve) => resolvePromise = resolve);

 const fastify = require("fastify")();

 // Register fastify-multipart to support file uploads
 fastify.register(require("@fastify/multipart"), {
  limits: {
   fieldNameSize: 10000, // Max field name size in bytes
   fieldSize: 10000,     // Max field value size in bytes
   fields: 500,          // Max number of non-file fields
   fileSize: 10000000,   // Max file size in bytes = 10MB
   files: 1,             // Max number of file fields
   headerPairs: 2000,    // Max number of header key=>value pairs
   parts: 1000,           // Max number of parts (fields + files)
  },
 });
 fastify.register(require("@fastify/view"), {
  engine: {
    ejs: require("ejs"),
  },
 });
 fastify.register(require("@fastify/static"), {
  root: `${__dirname}/static`,
  prefix: "/static/",
 });

 fastify.setNotFoundHandler((request, reply) => {
  return reply.code(404).view(`/views/404.ejs`);
 });

 // Upload image
 fastify.post("/upload", async (request, reply) => {

  if (process.env.UPLOAD_TOKEN && request.headers.authorization !== process.env.UPLOAD_TOKEN) {
   return reply.code(401).send({
    code: 0,
    message: "Unauthorized",
   });
  }

  if (!request.isMultipart()) {
   if (process.env.HIDE_UPLOAD_ERRORS !== "true") {
    console.log("[Upload error] Request is not multipart.");
   }
   return reply.code(400).send({
    code: 1,
    message: "Invalid request",
   })
  }
 
  const data = await request.file();

  if (!data) {
   if (process.env.HIDE_UPLOAD_ERRORS !== "true") {
    console.log("[Upload error] Request does not include file. Try to upload files how Discord suggests it: https://discord.com/developers/docs/reference#uploading-files");
   }
   return reply.code(400).send({
    code: 4,
    message: "File not found"
   });
  }

  if (!utils.allowedMimeTypes.has(data.mimetype)) {
   if (process.env.HIDE_UPLOAD_ERRORS !== "true") {
    console.log("[Upload error] Request does not include allowed file.");
   }
   return reply.code(400).send({
    code: 2,
    message: "Invalid file type",
   });
  }

  const buffer = await data.toBuffer();
  let image = await utils.storeImage({
   buffer,
   mime: data.mimetype,
   request,
  });

  if (!image) {
   if (process.env.HIDE_UPLOAD_ERRORS !== "true") {
    console.log("[Upload error] Image upload failed.");
   }
   return reply.code(500).send({
    code: 3,
    message: "Image upload failed, please try again.",
   });
  }

  reply.code(200).send({
   id: image.id,
  });

 });

 // View image
 fastify.get("/:id", async (request, reply) => {

  if (!request.params.id) return reply.code(404).view(`/views/404.ejs`);

  // Set CORS headers
  let headers = {};
  if (request.headers.origin) {
   if (!allowedOrigins.has(request.headers.origin)) return reply.code(400).send({ code: 0 });
   headers["access-control-allow-origin"] = request.headers.origin;
  }

  // Fetch image
  let imageId     = request.params.id,
      imageBuffer = null,
      imageMime   = null;
  switch (process.env.STORE_METHOD) {
   
   // Local storage
   case "local":
    var imagePaths = await fg(`${process.env.STORE_LOCAL_PATH}/${imageId}.*`, {
     onlyFiles: true,
     caseSensitiveMatch: true,
    }).catch((err) => {
     console.log("[Local] Image path resolve error:", err);
    });
    if (!imagePaths?.length) break;
    imageBuffer = await fs.readFile(imagePaths[0]);
    imageMime = `image/${imagePaths[0].split(".").pop()}`
    break;

   // Cloudflare Images
   case "cf":
    var imageResult = await utils.getImageBufferByURL(`${process.env.STORE_CF_DELIVERY_URL}/${imageId}/public`);
    if (!imageResult) break;
    imageBuffer = imageResult.buffer;
    imageMime = imageResult.mime;
    break;

   // Fetch from Cloudflare Images, then store locally to reduce requests to Cloudflare
   case "cflocal":
    var imagePaths = await fg(`${process.env.STORE_LOCAL_PATH}/${imageId}.*`, {
     onlyFiles: true,
     caseSensitiveMatch: true,
    }).catch((err) => {
     console.log("[Local] Image path resolve error:", err);
    });
    if (imagePaths?.length) {
     imageBuffer = await fs.readFile(imagePaths[0]);
     imageMime = `image/${imagePaths[0].split(".").pop()}`
    } else {
     // Fetch from Cloudflare Images
     var imageResult = await utils.getImageBufferByURL(`${process.env.STORE_CF_DELIVERY_URL}/${imageId}/public`);
     if (!imageResult) break;
     imageBuffer = imageResult.buffer;
     imageMime = imageResult.mime;
     // Store locally for future requests
     setTimeout(async () => {
      let diskSpace = await checkDiskSpace(path.resolve(process.env.STORE_LOCAL_PATH));
      // 100MB in bytes = 1e+8
      if (diskSpace.free < imageBuffer.length || diskSpace.free < 1e+8) return console.log("[Local] Not enough space to store image locally.");
      utils.storeLocalImage({
       buffer: imageBuffer,
       mime: imageMime,
       imageId,
      });
     });
    }
    break;

  }
  if (!imageBuffer) return reply.code(404).view(`/views/404.ejs`);
  // Send image
  let isBot     = request.headers["user-agent"].includes("bot"),
      isDiscord = !request.headers.accept && !request.headers.referer && !request.headers["accept-language"] && request.headers["user-agent"].startsWith("Mozilla/"), // Make somehow sure that Discord is making that request to display image properly within client
      isGitHub  = request.headers["user-agent"].includes("github-camo");
  if (isBot || isDiscord || isGitHub || headers["access-control-allow-origin"] || request.headers["sec-fetch-dest"] === "image") {
   headers["content-type"] = imageMime;
   headers["cache-control"] = "public, max-age=604800, immutable";
   reply.headers(headers);
   return reply.code(200).send(imageBuffer);
  }
  reply.headers(headers);
  return reply.code(200).view(`/views/image.ejs`, { dataurl: `data:${imageMime};base64,${imageBuffer.toString("base64")}` });
 });

 fastify.listen({
  host: process.env.HOST,
  port: process.env.PORT
 }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1);
  }
  console.log("[Server] Listening on", address);
  resolvePromise();
 });

 return promise;

}