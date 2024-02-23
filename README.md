![Sapphire Images](https://img-temp.sapph.xyz/4d10730c-b55d-42b7-a7ec-383647870800)

# Sapphire Images
Sapphire Images allows you to upload images and get URLs that permanently point to these images right within Discord.

Images uploaded to Discord get a new image link every few weeks since Feburary 2024.

This means that images uploaded to Discord can no longer be used as Moderation proof. Sapphire Images aims to fix that.

<br>
<br>

## General features
- Discord bot
   - Command /upload-image allows you to upload an image
   - Auto-upload images attached to messages with the bot being mentioned (@bot)
   - Auto-upload images sent in set channels
- Web server
   - Endpoint /upload allows image uploads (optionally with auth)
   - Serves images uploaded using the bot or the upload endpoint
- Storage methods:
  - **Local** - Stores images in set folder
  - **Cloudflare** - Uploads images to [Cloudflare Images](https://www.cloudflare.com/developer-platform/cloudflare-images/)
  - **Cloudflare with local** - Upload images to Cloudflare and store them locally to reduce requests to Cloudflare.
  - _More aren't planned but feel free to add them yourself, I am happy to merge any useful pull requests!_

<br>
<br>

## Set up
Follow the steps below to set up Sapphire Images. It was only tested in a Linux environment.
### 1. Clone the repository and install dependencies:
```
git clone https://github.com/Sapphire-Discord-Bot/images
cd images
npm install
```
### 2. Rename `_.env` to `.env`:
```
mv _.env .env
```
### 3. Edit `.env` to your liking, make sure to adjust the following properties:
   - `DISCORD_TOKEN`: Set your Discord bot token ([How to obtain a token?](#how-to-obtain-a-discord-bot-token))
   - `UPLOAD_TOKEN`: Set to random characters to prevent people from uploading images through the web without auth
   - `STORE_METHOD`: Set to your preferred image store method ([How to set up each method?](#how-to-set-up-store-method-local))
### 4. Start it using
```
npm start
```

<br>
<br>

## Customization
### Update logo
Replace the file located in `./static/icons/logo.png`.

---

### Update Discord messages
Edit the values of the properties below `# Customization texts` inside `./.env`.

<br>
<br>

## FAQ

### How to obtain a Discord bot token?
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Once created, go to your application's "Bot" tab.
4. Click "Reset token" and store the token somewhere safe.

---

### How to set up store method `local`?

Store images inside a set folder.

1. Set `STORE_LOCAL_PATH` to the folder path you want uploaded images to go. Make sure the folder is created. 

---

### How to set up store method `cf`?

Store images using Cloudflare's Images service.

1. Go to [Cloudflare Images](https://www.cloudflare.com/developer-platform/cloudflare-images/).
2. Click "Sign up for Cloudflare Images".
3. Once logged in, choose a paid plan that fits your needs (starting at $5/month).
4. **Make sure to enable storage when subscribing, otherwise this store method won't work.**
5. Once subscribed, locate your Account ID and Image Delivery URL.
6. Set `STORE_CF_ID` to your Account ID.
7. Set `STORE_CF_DELIVERY_URL` to your Image Delivery URL, make sure to **leave out** `/<image_id>/<variant_name>` and end your URL with a slash.
   - For example: `STORE_CF_DELIVERY_URL=https://imagedelivery.net/kOobDSmCCUYL7kOnWLrX4M/`
8. Go to your [Cloudflare API tokens](https://dash.cloudflare.com/profile/api-tokens).
9. Create a token and choose "Custom token".
10. Name your token and set permissions to `Read` and `Edit` `Account > Cloudflare Images`.
11. Once your token is created, set `STORE_CF_TOKEN` to your just created token.

---

### How to set up store method `cflocal`?

Store images locally and upload them to Cloudflare Images as well to make use of Cloudflare's permanent image storage while reducing requests to Cloudflare.

1. Set up store method `local` ([as described above](#how-to-set-up-store-method-local)).
2. Set up store method `cf` ([as described above](#how-to-set-up-store-method-cf)).

<br>
<br>
