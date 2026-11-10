const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const http = require('http');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// --- 1. MINI SERVEUR WEB (Health Check pour Render - anti-timeout 24/7) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot Discord Économie & Banque en ligne 24/7 !');
});
server.listen(PORT, () => {
  console.log(`🌐 [HTTP] Mini serveur web actif sur le port ${PORT}`);
});

// --- 2. CLIENT DISCORD ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Base de données JSON locale sécurisée
const dbFile = './bank_db.json';
let bankData = {};

if (fs.existsSync(dbFile)) {
  try {
    bankData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  } catch (e) {
    bankData = {};
  }
} else {
  fs.writeFileSync(dbFile, JSON.stringify({}));
}

function saveDb() {
  fs.writeFileSync(dbFile, JSON.stringify(bankData, null, 2));
}

function getUserData(userId) {
  if (!bankData[userId]) {
    bankData[userId] = { balance: 100, bank: 500, lastDaily: 0, blacklisted: false };
  }
  if (bankData[userId].blacklisted === undefined) bankData[userId].blacklisted = false;
  return bankData[userId];
}

// --- 3. GÉNÉRATEUR D'IMAGE DE BANQUE (Canvas : Dégradé Bleu/Violet/Rouge + Avatar + Solde) ---
async function generateBankImage(user, userData) {
  const canvas = createCanvas(700, 250);
  const ctx = canvas.getContext('2d');

  // Dégradé stylé : Bleu -> Violet -> Rouge
  const gradient = ctx.createLinearGradient(0, 0, 700, 250);
  gradient.addColorStop(0, '#1E3A8A'); // Bleu
  gradient.addColorStop(0.5, '#7C3AED'); // Violet
  gradient.addColorStop(1, '#EF4444'); // Rouge

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 700, 250);

  // Cadre sombre semi-transparent pour l'effet design
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(20, 20, 660, 210);

  // Avatar du profil (Haut à gauche)
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

    // Bordure blanche autour de l'avatar
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(85, 105, 45, 0, Math.PI * 2, true);
    ctx.stroke();
  } catch (err) {
    console.error('Erreur chargement avatar canvas:', err);
  }

  // Pseudo / Nom en haut à gauche (à côté de l'avatar)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(user.username, 150, 85);

  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText('Compte Bancaire Officiel - Sécurisé', 150, 112);

  // Solde en haut à droite (Portefeuille + Banque)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FACC15'; // Doré
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`${userData.balance} Pièces`, 650, 80);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`Coffre Banque : ${userData.bank} pièces`, 650, 110);

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'bank-card.png' });
}

// --- 4. LISTE DES COMMANDES SLASH ---
const commands = [
  new SlashCommandBuilder().setName('daily').setDescription('Récupère ta récompense quotidienne de pièces !'),
  new SlashCommandBuilder().setName('banque').setDescription('Affiche ta carte bancaire visuelle et stylée.'),
  new SlashCommandBuilder().setName('deposit').setDescription('Dépose de l\'argent en banque.').addIntegerOption(o => o.name('montant').setDescription('Montant à déposer').setRequired(true)),
  new SlashCommandBuilder().setName('withdraw').setDescription('Retire de l\'argent de la banque.').addIntegerOption(o => o.name('montant').setDescription('Montant à retirer').setRequired(true)),
  new SlashCommandBuilder().setName('pay').setDescription('Envoie de l\'argent à un autre utilisateur.').addUserOption(o => o.name('destinataire').setDescription('À qui envoyer').setRequired(true)).addIntegerOption(o => o.name('montant').setDescription('Montant').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie la latence du bot.'),
  
  // Commandes Administratives demandées
  new SlashCommandBuilder()
    .setName('give')
    .setDescription('[ADMIN] Donne des pièces à un utilisateur.')
    .addUserOption(o => o.name('utilisateur').setDescription('Membre cible').setRequired(true))
    .addIntegerOption(o => o.name('montant').setDescription('Montant à donner').setRequired(true)),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('[ADMIN] Retire des pièces à un utilisateur.')
    .addUserOption(o => o.name('utilisateur').setDescription('Membre cible').setRequired(true))
    .addIntegerOption(o => o.name('montant').setDescription('Montant à retirer').setRequired(true)),
  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('[ADMIN] Bloque un utilisateur du système.')
    .addUserOption(o => o.name('utilisateur').setDescription('Membre à bloquer').setRequired(true)),
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('[ADMIN] Débloque un utilisateur de la blacklist.')
    .addUserOption(o => o.name('utilisateur').setDescription('Membre à débloquer').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag} !`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Enregistrement des commandes slash...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commandes slash enregistrées avec succès !');
  } catch (erreur) {
    console.error(erreur);
  }
});

// --- 5. GESTION DES INTERACTIONS ET COMMANDES ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, member } = interaction;
  const userData = getUserData(user.id);

  // Vérification de la blacklist globale
  if (userData.blacklisted && commandName !== 'whitelist') {
    return interaction.reply({ content: '⛔ Tu as été banni / blacklisté du système bancaire par un administrateur.', ephemeral: true });
  }

  try {
    if (commandName === 'ping') {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🏓 Pong !')
        .setDescription(`Latence du bot : **${client.ws.ping}ms**`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } 
    else if (commandName === 'daily') {
      const maintenant = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;
      if (maintenant - userData.lastDaily < cooldown) {
        const restant = cooldown - (maintenant - userData.lastDaily);
        const heures = Math.floor(restant / (1000 * 60 * 60));
        const embed = new EmbedBuilder()
          .setColor(0xFF5733)
          .setTitle('⏳ Patientez !')
          .setDescription(`Vous avez déjà récupéré votre quotidien. Revenez dans **${heures} heures**.`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      userData.balance += 500;
      userData.lastDaily = maintenant;
      saveDb();
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('💰 Récompense quotidienne')
        .setDescription(`Félicitations ${user}, vous avez reçu **500 pièces** !`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } 
    else if (commandName === 'banque') {
      await interaction.deferReply();
      const attachment = await generateBankImage(user, userData);
      const embed = new EmbedBuilder()
        .setColor(0x3B82F6)
        .setTitle('🏦 COMPTE BANCAIRE OFFICIEL')
        .setImage('attachment://bank-card.png')
        .setFooter({ text: 'Système bancaire sécurisé • Dégradé Bleu, Violet & Rouge' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed], files: [attachment] });
    }
    else if (commandName === 'deposit') {
      const montant = interaction.options.getInteger('montant');
      if (montant <= 0 || userData.balance < montant) {
        return interaction.reply({ content: '❌ Montant invalide ou solde insuffisant dans ton portefeuille.', ephemeral: true });
      }
      userData.balance -= montant;
      userData.bank += montant;
      saveDb();
      await interaction.reply({ content: `✅ Tu as déposé **${montant} pièces** dans ton coffre bancaire.` });
    }
    else if (commandName === 'withdraw') {
      const montant = interaction.options.getInteger('montant');
      if (montant <= 0 || userData.bank < montant) {
        return interaction.reply({ content: '❌ Montant invalide ou solde insuffisant en banque.', ephemeral: true });
      }
      userData.bank -= montant;
      userData.balance += montant;
      saveDb();
      await interaction.reply({ content: `✅ Tu as retiré **${montant} pièces** de ta banque vers ton portefeuille.` });
    }
    else if (commandName === 'pay') {
      const destinataireUser = interaction.options.getUser('destinataire');
      const montant = interaction.options.getInteger('montant');

      if (destinataireUser.bot || destinataireUser.id === user.id) {
        return interaction.reply({ content: '❌ Tu ne peux pas envoyer de l\'argent à un bot ou à toi-même.', ephemeral: true });
      }
      if (montant <= 0 || userData.balance < montant) {
        return interaction.reply({ content: '❌ Solde insuffisant dans ton portefeuille.', ephemeral: true });
      }

      const destinataireData = getUserData(destinataireUser.id);
      userData.balance -= montant;
      destinataireData.balance += montant;
      saveDb();

      await interaction.reply({ content: `💸 ${user} a envoyé avec succès **${montant} pièces** à ${destinataireUser} !` });
    }
    // --- COMMANDES ADMINISTRATIVES (Give, Remove, Blacklist, Whitelist) ---
    else if (['give', 'remove', 'blacklist', 'whitelist'].includes(commandName)) {
      if (!member.permissions.has('Administrator')) {
        return interaction.reply({ content: '⛔ Tu dois posséder la permission **Administrateur** pour exécuter cette commande.', ephemeral: true });
      }

      const cible = interaction.options.getUser('utilisateur');
      const cibleData = getUserData(cible.id);

      if (commandName === 'give') {
        const montant = interaction.options.getInteger('montant');
        cibleData.balance += montant;
        saveDb();
        await interaction.reply({ content: `🎁 [ADMIN] Ajout réussi de **${montant} pièces** au compte de ${cible.username}.` });
      } 
      else if (commandName === 'remove') {
        const montant = interaction.options.getInteger('montant');
        cibleData.balance = Math.max(0, cibleData.balance - montant);
        saveDb();
        await interaction.reply({ content: `⚠️ [ADMIN] Retrait de **${montant} pièces** sur le compte de ${cible.username}.` });
      } 
      else if (commandName === 'blacklist') {
        cibleData.blacklisted = true;
        saveDb();
        await interaction.reply({ content: `⛔ [ADMIN] L'utilisateur ${cible.username} a été **blacklisté** (bloqué) du système bancaire.` });
      } 
      else if (commandName === 'whitelist') {
        cibleData.blacklisted = false;
        saveDb();
        await interaction.reply({ content: `✅ [ADMIN] L'utilisateur ${cible.username} a été **whiteliste/débloqué** avec succès.` });
      }
    }
  } catch (err) {
    console.error('Erreur execution commande:', err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⚠️ Oups ! Une erreur est survenue')
      .setDescription('Le script a géré l\'exception pour éviter tout crash de l\'application.')
      .setTimestamp();
    
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});

// Connexion sécurisée au bot
client.login(process.env.DISCORD_TOKEN);
      
