const path       = require("path"),
      fs         = require("fs/promises"),
      FormData   = require("form-data"),
      { nanoid } = require("nanoid");

exports.allowedMimeTypes = new Set([
 "image/jpeg",
 "image/png",
 "image/webp",
 "image/gif",
]);

/**
 * Fetch with error handling
 * @param {String} url URL to fetch
 * @param {Object} options Fetch options
 * @param {Number} retryTimeout Milliseconds to wait before retrying
 * @returns {Promise<Response>}
 */
exports.fetch = async (url, options, retryTimeout = 1000) => {
 let result = await fetch(url, options).catch((err) => {
  console.log(`[Fetch] Request to ${url} failed:`, err);
  return new Promise((resolve) => {
   setTimeout(async () => {
    resolve(await fetch(url, options).catch(() => null))
   }, retryTimeout);
  });
 });
 return result;
}

/**
 * Store image
 * @param {Object} options Options 
 * @returns {Promise<Object>} Image object { id }
 */
exports.storeImage = async ({ buffer, url, mime, interaction, message, request } = {}) => {
 switch (process.env.STORE_METHOD) {

  // Store image locally
  case "local":
   return await this.storeLocalImage({
    buffer,
    mime,
    url,
   });

  // Store image using Cloudflare Images
  case "cf":
   return await this.storeCloudflareImage({
    buffer,
    url,
    useURL: !!interaction?.ephemeral, // Letting CF fetch the image by URL only works with ephemeral interactions, I don't know why :(
   });

  case "cflocal":
   var metadata = metadata || {};
   if (interaction?.user?.id || message?.author?.id) {
    metadata.discordAuthorId = interaction?.user?.id || message?.author?.id;
   }
   var uploadResult = await this.storeCloudflareImage({
    buffer,
    url,
    useURL: !!interaction?.ephemeral, // Letting CF fetch the image by URL only works with ephemeral interactions, I don't know why :(
    metadata: request?.query,
   });
   if (!uploadResult) return null;
   var newImageId = uploadResult.id;
   var putSlash = !process.env.STORE_CF_DELIVERY_URL?.endsWith?.("/");
   return await this.storeLocalImage({
    url: `${process.env.STORE_CF_DELIVERY_URL}${putSlash ? "/" : ""}${newImageId}/public`,
    imageId: newImageId
   });


  // Add other storage methods here
  // ...

  default:
   return null;

 }
}

/**
 * Get image buffer by URL
 * @param {String} url URL to fetch 
 * @returns {Promise<Object>} Image buffer { buffer, mime } 
 */
exports.getImageBufferByURL = async (url) => {
 var imageResult = await this.fetch(url, {
  headers: process.env.STORE_CFLOCAL_ALLOW_AVIF === "true" ? {
   accept: "image/avif,image/png,image/webp,image/jpeg,image/gif"
  } : {}
 });
 if (!imageResult?.ok) {
  console.log(`Image download (${url}) failed:`, imageResult.status, await imageResult.text());
  return null;
 }
 return {
  buffer: Buffer.from(await imageResult.arrayBuffer()),
  mime: imageResult.headers.get("content-type"),
 }
}


/**
 * Store image locally
 * @param {Object} options Options
 * @returns {Promise<Object>} Image object { id }
 */
exports.storeLocalImage = async ({ buffer, url, mime, imageId = nanoid(35) } = {}) => {
 // Make URL buffer
 if (!buffer) {
  let imageFetchResult = await this.getImageBufferByURL(url);
  buffer = imageFetchResult.buffer;
  if (!mime) {
   mime = imageFetchResult.mime;
  }
 }
 let filePath = path.join(process.env.STORE_LOCAL_PATH, `${imageId}.${mime.split("/")[1]}`);
 // Write to local storage
 try {
  await fs.writeFile(filePath, buffer);
 } catch (err) {
  console.log("[Local] Image write failed:", err, "- Did you create the folder in which local images should be stored?");
  return null;
 }
 return {
  id: imageId,
 };
}

/**
 * Upload images to Cloudflare Images
 * @returns {Promise<Object>} Image object { id }
 */
exports.storeCloudflareImage = ({ buffer, url, useURL = false, metadata = null } = {}) => {
 return new Promise(async (resolve) => {
  var form = new FormData();
  // Letting CF fetch the image by URL only works with ephemeral interactions, I don't know why :(
  if (useURL) {
   form.append("url", url);
  } else {
   // Make URL buffer
   if (!buffer) {
    let imageFetchResult = await this.getImageBufferByURL(url);
    buffer = imageFetchResult.buffer;
   }
   form.append("file", buffer);
  }
  if (metadata) {
   form.append("metadata", JSON.stringify(metadata));
  }
  form.submit({
   host: "api.cloudflare.com",
   path: `/client/v4/accounts/${process.env.STORE_CF_ID}/images/v1`,
   method: "POST",
   protocol: "https:",
   headers: {
    "Authorization": `Bearer ${process.env.STORE_CF_TOKEN}`,
   },
  }, (err, res) => {
   if (err) {
    console.log("[CF] Image upload failed:", err);
    return resolve(null);
   }
   if (res.statusCode !== 200) {
    console.log("[CF] Image upload failed:", res.statusCode, res.statusMessage);
    return resolve(null);
   }
   res.setEncoding("utf8");
   let chunks = [];
   res.on("data", (chunk) => {
    chunks += chunk;
   });
   res.on("end", () => {
    let data = JSON.parse(chunks);
    resolve({
     id: data.result.id,
    });
   });
  });
 });
}
