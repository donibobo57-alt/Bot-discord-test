const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const http = require('http');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// --- 1. MINI SERVEUR WEB (Health Check Render - Anti-timeout 24/7) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot Guilde RPG & Économie en ligne 24/7 !');
});
server.listen(PORT, () => {
  console.log(`🌐 [HTTP] Serveur web de garde actif sur le port ${PORT}`);
});

// --- 2. CLIENT DISCORD ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Base de données JSON des aventuriers
const dbFile = './guild_db.json';
let guildData = {};

if (fs.existsSync(dbFile)) {
  try {
    guildData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (e) {
    guildData = {};
  }
} else {
  fs.writeFileSync(dbFile, JSON.stringify({}));
}

function saveDb() {
  fs.writeFileSync(dbFile, JSON.stringify(guildData, null, 2));
}

function getAdventurerData(userId) {
  if (!guildData[userId]) {
    guildData[userId] = { crystals: 150, vault: 600, lastBounty: 0, exiled: false };
  }
  if (guildData[userId].exiled === undefined) guildData[userId].exiled = false;
  return guildData[userId];
}

// --- 3. GÉNÉRATEUR D'IMAGE CARTE D'AVENTURIER (Canvas : Dégradé Bleu/Violet/Rouge + Avatar + Cristaux) ---
async function generateAdventurerCard(user, data) {
  const canvas = createCanvas(700, 250);
  const ctx = canvas.getContext('2d');

  // Dégradé stylé : Bleu -> Violet -> Rouge
  const gradient = ctx.createLinearGradient(0, 0, 700, 250);
  gradient.addColorStop(0, '#1E3A8A'); // Bleu
  gradient.addColorStop(0.5, '#7C3AED'); // Violet
  gradient.addColorStop(1, '#EF4444'); // Rouge

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 700, 250);

  // Cadre sombre semi-transparent
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(20, 20, 660, 210);

  // Avatar de l'aventurier (Haut à gauche)
  try {
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(85, 105, 45, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 40, 60, 90, 90);
    ctx.restore();

    // Bordure dorée/blanche autour de l'avatar
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(85, 105, 45, 0, Math.PI * 2, true);
    ctx.stroke();
  } catch (err) {
    console.error('Erreur chargement avatar canvas:', err);
  }

  // Pseudo de l'aventurier
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(user.username, 150, 85);

  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText('Guilde des Aventuriers • Certifié', 150, 112);

  // Solde et Trésor en haut à droite
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FACC15'; // Doré
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${data.crystals} Cristaux`, 650, 80);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`Coffre de Guilde : ${data.vault} pièces`, 650, 110);

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'adventurer-card.png' });
}

// --- 4. NOUVELLES COMMANDES SLASH (Concepts RPG / Aventure) ---
const commands = [
  new SlashCommandBuilder().setName('bounty').setDescription('Récupère ta prime quotidienne de cristaux !'),
  new SlashCommandBuilder().setName('fiches').setDescription('Affiche ta carte d\'aventurier personnalisée et tes richesses.'),
  new SlashCommandBuilder().setName('store').setDescription('Dépose des cristaux dans le coffre sécurisé de la guilde.').addIntegerOption(o => o.name('montant').setDescription('Nombre de cristaux à stocker').setRequired(true)),
  new SlashCommandBuilder().setName('retrieve').setDescription('Retire des cristaux du coffre de guilde vers ton inventaire.').addIntegerOption(o => o.name('montant').setDescription('Nombre de cristaux à retirer').setRequired(true)),
  new SlashCommandBuilder().setName('trade').setDescription('Donne ou échange des cristaux avec un autre aventurier.').addUserOption(o => o.name('destinataire').setDescription('Aventurier cible').setRequired(true)).addIntegerOption(o => o.name('montant').setDescription('Montant').setRequired(true)),
  new SlashCommandBuilder().setName('latence').setDescription('Vérifie la réactivité magique du bot.'),
  
  // Commandes Maître de Donjon (Admin) redéfinies
  new SlashCommandBuilder()
    .setName('grant')
    .setDescription('[MAÎTRE DE DONJON] Offre des cristaux à un aventurier.')
    .addUserOption(o => o.name('aventurier').setDescription('Aventurier cible').setRequired(true))
    .addIntegerOption(o => o.name('montant').setDescription('Montant de cristaux').setRequired(true)),
  new SlashCommandBuilder()
    .setName('drain')
    .setDescription('[MAÎTRE DE DONJON] Soustrait des cristaux à un aventurier.')
    .addUserOption(o => o.name('aventurier').setDescription('Aventurier cible').setRequired(true))
    .addIntegerOption(o => o.name('montant').setDescription('Montant à soustraire').setRequired(true)),
  new SlashCommandBuilder()
    .setName('exile')
    .setDescription('[MAÎTRE DE DONJON] Exile (bannit) un aventurier de la guilde.')
    .addUserOption(o => o.name('aventurier').setDescription('Aventurier à exiler').setRequired(true)),
  new SlashCommandBuilder()
    .setName('pardon')
    .setDescription('[MAÎTRE DE DONJON] Réintègre un aventurier exilé.')
    .addUserOption(o => o.name('aventurier').setDescription('Aventurier à gracier').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🛡️ Bot d'Aventure connecté en tant que ${client.user.tag} !`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Enregistrement des quêtes et commandes slash...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commandes de guilde enregistrées avec succès !');
  } catch (erreur) {
    console.error(erreur);
  }
});

// --- 5. GESTION DES INTERACTIONS ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, member } = interaction;
  const data = getAdventurerData(user.id);

  // Vérification de l'exil (Blacklist)
  if (data.exiled && commandName !== 'pardon') {
    return interaction.reply({ content: '📜 Tu as été exilé de la guilde par un Maître de Donjon. Accès refusé.', ephemeral: true });
  }

  try {
    if (commandName === 'latence') {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🔮 Connexion Magique')
        .setDescription(`Latence du royaume : **${client.ws.ping}ms**`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } 
    else if (commandName === 'bounty') {
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;
      if (now - data.lastBounty < cooldown) {
        const restant = cooldown - (now - data.lastBounty);
        const heures = Math.floor(restant / (1000 * 60 * 60));
        const embed = new EmbedBuilder()
          .setColor(0xFF5733)
          .setTitle('⏳ Prime déjà récupérée !')
          .setDescription(`Reviens dans **${heures} heures** pour réclamer ta prochaine prime d'aventurier.`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      data.crystals += 300;
      data.lastBounty = now;
      saveDb();
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('⚔️ Prime Quotidienne')
        .setDescription(`Bien joué ${user}, tu as perçu ta prime de guilde de **300 cristaux** !`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } 
    else if (commandName === 'fiches') {
      await interaction.deferReply();
      const attachment = await generateAdventurerCard(user, data);
      const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('📜 FICHE D\'AVENTURIER OFFICIELLE')
        .setImage('attachment://adventurer-card.png')
        .setFooter({ text: 'Ordre des Guildes • Thème Dégradé Magique' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed], files: [attachment] });
    }
    else if (commandName === 'store') {
      const amount = interaction.options.getInteger('montant');
      if (amount <= 0 || data.crystals < amount) {
        return interaction.reply({ content: '❌ Quantité invalide ou cristaux insuffisants dans ta bourse.', ephemeral: true });
      }
      data.crystals -= amount;
      data.vault += amount;
      saveDb();
      await interaction.reply({ content: `🏰 Tu as sécurisé **${amount} cristaux** dans le coffre de la guilde.` });
    }
    else if (commandName === 'retrieve') {
      const amount = interaction.options.getInteger('montant');
      if (amount <= 0 || data.vault < amount) {
        return interaction.reply({ content: '❌ Montant invalide ou coffre de guilde insuffisant.', ephemeral: true });
      }
      data.vault -= amount;
      data.crystals += amount;
      saveDb();
      await interaction.reply({ content: `🗝️ Tu as retiré **${amount} cristaux** du coffre pour ta bourse personnelle.` });
    }
    else if (commandName === 'trade') {
      const targetUser = interaction.options.getUser('destinataire');
      const amount = interaction.options.getInteger('montant');

      if (targetUser.bot || targetUser.id === user.id) {
        return interaction.reply({ content: '❌ Impossible de troquer des cristaux avec un automate ou toi-même.', ephemeral: true });
      }
      if (amount <= 0 || data.crystals < amount) {
        return interaction.reply({ content: '❌ Tu ne possèdes pas assez de cristaux dans ta bourse pour cet échange.', ephemeral: true });
      }

      const targetData = getAdventurerData(targetUser.id);
      data.crystals -= amount;
      targetData.crystals += amount;
      saveDb();

      await interaction.reply({ content: `🤝 ${user} a offert **${amount} cristaux** à l'aventurier ${targetUser} !` });
    }
    // --- COMMANDES MAÎTRE DE DONJON (Admin) ---
    else if (['grant', 'drain', 'exile', 'pardon'].includes(commandName)) {
      if (!member.permissions.has('Administrator')) {
        return interaction.reply({ content: '⛔ Seul un **Maître de Donjon** (Administrateur) peut invoquer ces décrets.', ephemeral: true });
      }

      const target = interaction.options.getUser('aventurier');
      const targetData = getAdventurerData(target.id);

      if (commandName === 'grant') {
        const amount = interaction.options.getInteger('montant');
        targetData.crystals += amount;
        saveDb();
        await interaction.reply({ content: `🎁 [MAÎTRE DE DONJON] Attribution magique de **${amount} cristaux** à ${target.username}.` });
      } 
      else if (commandName === 'drain') {
        const amount = interaction.options.getInteger('montant');
        targetData.crystals = Math.max(0, targetData.crystals - amount);
        saveDb();
        await interaction.reply({ content: `⚡ [MAÎTRE DE DONJON] Prélèvement de **${amount} cristaux** sur ${target.username}.` });
      } 
      else if (commandName === 'exile') {
        targetData.exiled = true;
        saveDb();
        await interaction.reply({ content: `📜 [MAÎTRE DE DONJON] L'aventurier ${target.username} a été **exilé** de la guilde.` });
      } 
      else if (commandName === 'pardon') {
        targetData.exiled = false;
        saveDb();
        await interaction.reply({ content: `✨ [MAÎTRE DE DONJON] L'aventurier ${target.username} a reçu son **pardon** et réintègre la guilde.` });
      }
    }
  } catch (err) {
    console.error('Erreur d\'exécution :', err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⚠️ Anomalie mystique détectée')
      .setDescription('Une perturbation a été interceptée et isolée pour protéger le royaume.')
      .setTimestamp();
    
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});

// Connexion du bot avec le token sécurisé
client.login(process.env.DISCORD_TOKEN);
        
