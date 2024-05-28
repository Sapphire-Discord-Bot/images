const { Client, Events, GatewayIntentBits, ActivityType, ApplicationCommandType, ApplicationCommandOptionType } = require("discord.js");
const fs = require("fs");

const utils = require("./utils.js");

exports.run = () => {

 let client = new Client({
  intents: [
   GatewayIntentBits.Guilds,
   GatewayIntentBits.GuildMessages,
   ...(process.env.AUTO_UPLOAD_CHANNEL_IDS ? [
    GatewayIntentBits.MessageContent
   ] : []),
  ],
  presence: process.env.BOT_STATUS_TEXT ? {
   activities: [{
    name: process.env.BOT_STATUS_TEXT,
    type: ActivityType.Custom,
    state: process.env.BOT_STATUS_TEXT,
   }]
  } : null,
 });

 client.on(Events.ClientReady, () => {
  console.log("[Discord] Logged in as", client.user.tag);
  // Register global commands
  if (fs.existsSync("cmds.lock")) {
   return console.log("[Discord] Global commands registered already. Delete cmds.lock to register again.");
  }
  client.application.commands.create({
   name: process.env.UPLOAD_COMMAND_NAME || "upload-image",
   type: ApplicationCommandType.ChatInput,
   description: process.env.UPLOAD_COMMAND_DESC || "Generate a permanently available link for an image",
   options: [{
    name: process.env.UPLOAD_COMMAND_ARG_NAME || "image",
    description: process.env.UPLOAD_COMMAND_DESC || "Generate a permanently available link for an image",
    type: ApplicationCommandOptionType.Attachment,
    required: true
   }]
  }).then(() => {
   console.log("[Discord] Global commands registered.");
   fs.writeFileSync("cmds.lock", "1");
  }).catch((err) => {
   console.log("[Discord] Failed to register global commands:", err);
  });
 });

 client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guildId) return;
  if (interaction.commandName === (process.env.UPLOAD_COMMAND_NAME || "upload-image")) {
   let attachment = interaction.options.get(process.env.UPLOAD_COMMAND_ARG_NAME || "image").attachment;
   if (!utils.allowedMimeTypes.has(attachment.contentType)) {
    return interaction.reply({
     ephemeral: true,
     content: process.env.ERR_INVALID_TYPE,
    });
   }
   await interaction.deferReply({
    ephemeral: true,
   });
   let image = await utils.storeImage({
    url: attachment.url,
    mime: attachment.contentType,
    interaction,
   });
   if (image) {
    interaction.editReply({
     ephemeral: true,
     content: process.env.IMAGE_UPLOADED_TEXT
      .replace(/\$linkWithProtocol/g, `${process.env.VISIBLE_HOST}/${image.id}${process.env.SHOW_IMAGE_WITH_SLASH_COMMAND === "true" ? " " : ""}`)
      .replace(/\$linkWithoutProtocol/g, `${process.env.VISIBLE_HOST.replace(/^https?:\/\//, "")}/${image.id}`),
    });
   } else {
    interaction.editReply({
     ephemeral: true,
     content: process.env.ERR_IMAGE_UPLOAD_FAILED,
    });
   }
  }
 });
 
 const mentionToUpload      = process.env.MENTION_TO_UPLOAD === "true",
       autoUploadChannelIds = new Set(process.env.AUTO_UPLOAD_CHANNEL_IDS?.split(",") || []),
       uploadingEmoji       = process.env.UPLOADING_EMOJI || false,
       uploadingEmojiIsExt  = !!parseInt(process.env.UPLOADING_EMOJI_EXT || false);
 client.on(Events.MessageCreate, async (message) => {
  let firstAttachment = message.attachments.first();
  if (!firstAttachment || message.author.bot) return;
  if (!autoUploadChannelIds.has(message.channelId) && (!mentionToUpload || !message.mentions.users.has(client.user.id))) return;
  if (!utils.allowedMimeTypes.has(firstAttachment.contentType)) return;
  let clientMemberPerms = message.channel.permissionsFor(message.guild.members.me);
  // Don't do anything if no perms to send messages
  if (message.channel.isThread()) {
   if (!clientMemberPerms.has("SendMessagesInThreads")) return;
  } else {
   if (!clientMemberPerms.has("SendMessages")) return;
  }
  let missingPerms = [];
  if (!clientMemberPerms.has("AddReactions")) {
   missingPerms.push("Add Reactions");
  }
  if (!clientMemberPerms.has("UseExternalEmojis")) {
   missingPerms.push("Use External Emojis");
  }
  let reactionPromise = (uploadingEmoji && clientMemberPerms.has("AddReactions") && (!uploadingEmojiIsExt || clientMemberPerms.has("UseExternalEmojis"))) ? message.react(uploadingEmoji).catch((err) => {
   console.log("[Discord] Adding upload message reaction failed:", err);
  }) : null;
  let image = await utils.storeImage({
   url: firstAttachment.url,
   mime: firstAttachment.contentType,
   message,
  }).catch((err) => {
   console.log("[Discord] Storing image failed (probably due to deleted message):", err);
   return null;
  });
  if (reactionPromise) {
   let reaction = await reactionPromise;
   await reaction?.users.remove(client.user.id).catch(() => null);
  }
  if (image) {
   message.reply({
    content: `${process.env.IMAGE_UPLOADED_TEXT}${missingPerms.length ? `\n\n_Note: I'm missing the following permissions to indicate that an image is being uploaded: ${missingPerms.join(", ")}_` : ""}`
     .replace(/\$linkWithProtocol/g, `${process.env.VISIBLE_HOST}/${image.id}${process.env.SHOW_IMAGE_WITH_AUTO_UPLOAD === "true" ? " " : ""}`)
     .replace(/\$linkWithoutProtocol/g, `${process.env.VISIBLE_HOST.replace(/^https?:\/\//, "")}/${image.id}`),
    allowedMentions: {
     repliedUser: false,
    },
   }).catch((err) => {
    console.log("[Discord] Replying to message failed (probably due to deleted message):", err);
    return null;
   });
  } else {
   message.reply({
    content: process.env.ERR_IMAGE_UPLOAD_FAILED,
    allowedMentions: {
     repliedUser: false,
    },
   }).catch((err) => {
    console.log("[Discord] Replying to message failed (probably due to deleted message):", err);
    return null;
   });
  }
 });

 client.login();

}