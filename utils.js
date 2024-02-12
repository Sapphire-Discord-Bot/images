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
   // Make URL buffer
   if (!buffer) {
    var imageResult = await this.fetch(url);
    if (!imageResult?.ok) {
     console.log("[Local] Image download failed:", imageResult.status, await imageResult.text());
     return null;
    }
    buffer = Buffer.from(await imageResult.arrayBuffer());
   }
   var newImageId = nanoid(35),
       filePath   = path.join(process.env.STORE_LOCAL_PATH, `${newImageId}.${mime.split("/")[1]}`);
   // Write to local storage
   try {
    await fs.writeFile(filePath, buffer);
   } catch (err) {
    console.log("[Local] Image write failed:", err);
    return null;
   }
   return {
    id: newImageId,
   };

  // Store image using Cloudflare Images
  case "cf":
   return await new Promise(async (resolve) => {
    var form = new FormData();
    // Letting CF fetch the image by URL only works with ephemeral interactions, I don't know why :(
    if (interaction?.ephemeral) {
     form.append("url", url);
    } else {
     // Make URL buffer
     if (!buffer) {
      var imageResult = await this.fetch(url);
      if (!imageResult?.ok) {
       console.log("[CF] Image download failed:", imageResult.status, await imageResult.text());
       return null;
      }
      buffer = Buffer.from(await imageResult.arrayBuffer());
     }
     form.append("file", buffer);
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
      return null;
     }
     if (res.statusCode !== 200) {
      console.log("[CF] Image upload failed:", res.statusCode, res.statusMessage);
      return null;
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

  // Add other storage methods here
  // ...

  default:
   return null;

 }
}