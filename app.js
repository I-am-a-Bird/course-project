const readline = require('readline');
const fs = require('fs');
const crypto = require('crypto');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

class UserManager {
    constructor() {
        this.users = new Map();
        this.userStats = new Map();
        this.loadUsers();
    }

    #hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    registerUser(username, password, email = '', role = 'user') {
        if (this.users.has(username)) {
            return { success: false, message: '❌ Пользователь уже существует' };
        }
        if (password.length < 4) {
            return { success: false, message: '❌ Пароль минимум 4 символа' };
        }
        const passwordHash = this.#hashPassword(password);
        this.users.set(username, { passwordHash, email, role, registrationDate: new Date().toISOString() });
        this.userStats.set(username, { gamesPlayed: 0, totalScore: 0, wins: 0, bestScore: 0 });
        this.saveUsers();
        return { success: true, message: '✅ Регистрация успешна!' };
    }

    loginUser(username, password) {
        const user = this.users.get(username);
        if (!user) return { success: false, message: '❌ Пользователь не найден' };
        if (user.passwordHash !== this.#hashPassword(password)) {
            return { success: false, message: '❌ Неверный пароль' };
        }
        return { success: true, message: '✅ Авторизация успешна!', user: { username, role: user.role, email: user.email } };
    }

    updateUserStats(username, score, isWin = false) {
        const stats = this.userStats.get(username);
        if (stats) {
            stats.gamesPlayed++;
            stats.totalScore += score;
            if (isWin) stats.wins++;
            if (score > stats.bestScore) stats.bestScore = score;
            this.saveUsers();
        }
    }

    getUserStats(username) {
        return this.userStats.get(username) || { gamesPlayed: 0, totalScore: 0, wins: 0, bestScore: 0 };
    }

    getAllUsers() {
        return Array.from(this.users.entries()).map(([username, data]) => ({
            username, role: data.role, email: data.email, registrationDate: data.registrationDate, stats: this.userStats.get(username)
        }));
    }

    deleteUser(username) {
        const deleted = this.users.delete(username);
        this.userStats.delete(username);
        if (deleted) this.saveUsers();
        return deleted;
    }

    saveUsers() {
        try {
            const data = { users: Array.from(this.users.entries()), userStats: Array.from(this.userStats.entries()) };
            fs.writeFileSync('users.json', JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Ошибка сохранения:', error.message);
        }
    }

    loadUsers() {
        try {
            if (fs.existsSync('users.json')) {
                const data = JSON.parse(fs.readFileSync('users.json', 'utf8'));
                this.users = new Map(data.users);
                this.userStats = new Map(data.userStats);
                if (this.users.size === 0) {
                    this.registerUser('admin', 'admin123', 'admin@system.com', 'admin');
                    this.registerUser('user', 'user123', 'user@example.com', 'user');
                }
            } else {
                this.registerUser('admin', 'admin123', 'admin@system.com', 'admin');
                this.registerUser('user', 'user123', 'user@example.com', 'user');
            }
        } catch (error) {
            console.error('Ошибка загрузки:', error.message);
        }
    }
}

class Serializable {
    constructor() {
        if (this.constructor === Serializable) {
            throw new Error("Cannot instantiate abstract class");
        }
    }
    serialize() { throw new Error("Method 'serialize()' must be implemented"); }
    deserialize(data) { throw new Error("Method 'deserialize()' must be implemented"); }
}

class Player extends Serializable {
    #name; #score; #id;
    constructor(name, id = null) {
        super();
        this.#name = name;
        this.#score = 0;
        this.#id = id || Math.random().toString(36).substr(2, 9);
    }
    get name() { return this.#name; }
    get score() { return this.#score; }
    get id() { return this.#id; }
    addPoint(points = 1) {
        this.#score += points;
        console.log(`${this.#name} получает ${points} очко! Текущий счет: ${this.#score}`);
    }
    resetScore() { this.#score = 0; }
    async makeMove(gameState) { throw new Error("Method 'makeMove()' must be implemented"); }
    serialize() { return { name: this.#name, score: this.#score, id: this.#id, type: this.constructor.name }; }
    deserialize(data) { this.#name = data.name; this.#score = data.score; this.#id = data.id; }
}

class ComputerPlayer extends Player {
    #difficulty; #wordDatabase;
    constructor(difficulty = 'medium') {
        super("Компьютер");
        this.#difficulty = difficulty;
        this.#wordDatabase = {
            'города': ['Москва', 'Амстердам', 'Мадрид', 'Лондон', 'Осло', 'Омск', 'Киев', 'Варшава', 'Афины', 'Сочи'],
            'животные': ['Антилопа', 'Баран', 'Носорог', 'Гепард', 'Дельфин', 'Енот', 'Жираф', 'Зебра', 'Игуана', 'Кенгуру'],
            'растения': ['Акация', 'Береза', 'Ромашка', 'Гвоздика', 'Дуб', 'Ель', 'Жасмин', 'Ирис', 'Кедр', 'Липа']
        };
    }
    async makeMove(gameState) {
        console.log("\n🤖 Ход компьютера...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const availableWords = this.#getAvailableWords(gameState.lastWord, gameState.usedWords, gameState.category);
        if (availableWords.length === 0) {
            console.log("❌ Компьютер не может найти подходящее слово");
            return null;
        }
        const selectedWord = this.#selectWordByDifficulty(availableWords);
        console.log(`✅ Компьютер говорит: ${selectedWord}`);
        return selectedWord;
    }
    #getAvailableWords(lastWord, usedWords, category) {
        const words = this.#wordDatabase[category] || [];
        return words.filter(word => {
            const lowerWord = word.toLowerCase();
            const lowerLastWord = lastWord ? lastWord.toLowerCase() : '';
            const isNewWord = !usedWords.has(lowerWord);
            const isValidSequence = !lastWord || lowerWord[0] === lowerLastWord[lowerLastWord.length - 1];
            return isNewWord && isValidSequence;
        });
    }
    #selectWordByDifficulty(words) {
        switch (this.#difficulty) {
            case 'easy': return words[0];
            case 'hard': return words.reduce((longest, current) => current.length > longest.length ? current : longest, words[0]);
            default: return words[Math.floor(Math.random() * words.length)];
        }
    }
    serialize() { const data = super.serialize(); data.difficulty = this.#difficulty; return data; }
    deserialize(data) { super.deserialize(data); this.#difficulty = data.difficulty || 'medium'; this.#wordDatabase = { 'города': [], 'животные': [], 'растения': [] }; }
}

class HumanPlayer extends Player {
    #email; #username;
    constructor(name, email = '', username = '') { super(name); this.#email = email; this.#username = username; }
    async makeMove(gameState) { const word = await ask(`\n🎮 ${this.name}, введите слово: `); return word.trim(); }
    get email() { return this.#email; }
    get username() { return this.#username; }
    serialize() { const data = super.serialize(); data.email = this.#email; data.username = this.#username; return data; }
    deserialize(data) { super.deserialize(data); this.#email = data.email || ''; this.#username = data.username || ''; }
}

class WordGame extends Serializable {
    #players; #usedWords; #currentCategory; #lastWord; #isGameActive; #currentUser; #userManager;
    constructor() {
        super();
        this.#players = [];
        this.#usedWords = new Set();
        this.#currentCategory = '';
        this.#lastWord = '';
        this.#isGameActive = false;
        this.#currentUser = null;
        this.#userManager = new UserManager();
    }
    async start() {
        console.log("🎮 ДОБРО ПОЖАЛОВАТЬ В ИГРУ В СЛОВА!");
        await this.#authMenu();
        await this.#mainMenu();
    }
    async #authMenu() {
        while (true) {
            console.log("\n=== СИСТЕМА АВТОРИЗАЦИИ ===");
            console.log("1. 🔐 Войти");
            console.log("2. 📝 Зарегистрироваться");
            console.log("3. ❌ Выход");
            const choice = await ask("Выберите действие: ");
            switch (choice) {
                case '1': if (await this.#login()) return; break;
                case '2': await this.#register(); break;
                case '3': console.log("👋 До свидания!"); process.exit(0);
                default: console.log("❌ Неверный выбор");
            }
        }
    }
    async #login() {
        const username = await ask("Введите логин: ");
        const password = await ask("Введите пароль: ");
        const result = this.#userManager.loginUser(username, password);
        console.log(result.message);
        if (result.success) {
            this.#currentUser = result.user;
            console.log(`🎯 Роль: ${this.#currentUser.role}`);
            return true;
        }
        return false;
    }
    async #register() {
        console.log("\n=== РЕГИСТРАЦИЯ ===");
        const username = await ask("Введите логин: ");
        const password = await ask("Введите пароль: ");
        const confirmPassword = await ask("Подтвердите пароль: ");
        if (password !== confirmPassword) { console.log("❌ Пароли не совпадают"); return; }
        const email = await ask("Введите email: ");
        const result = this.#userManager.registerUser(username, password, email);
        console.log(result.message);
        if (result.success) {
            const loginResult = this.#userManager.loginUser(username, password);
            if (loginResult.success) this.#currentUser = loginResult.user;
        }
    }
    async #mainMenu() {
        while (true) {
            console.log(`\n=== ГЛАВНОЕ МЕНЮ (${this.#currentUser.username}) ===`);
            console.log("1. 🎮 Новая игра");
            console.log("2. 👥 Управление игроками");
            console.log("3. 📊 Отчеты");
            console.log("4. 👤 Управление пользователями");
            console.log("5. 💾 Сохранить");
            console.log("6. 📂 Загрузить");
            console.log("7. 🔓 Сменить пользователя");
            console.log("0. ❌ Выход");
            const choice = await ask("Выберите действие: ");
            switch (choice) {
                case '1': await this.#startNewGame(); break;
                case '2': await this.#managePlayers(); break;
                case '3': await this.#showReports(); break;
                case '4': await this.#manageUsers(); break;
                case '5': await this.#saveGame(); break;
                case '6': await this.#loadGame(); break;
                case '7': this.#currentUser = null; await this.#authMenu(); break;
                case '0': console.log("👋 До свидания!"); rl.close(); return;
                default: console.log("❌ Неверный выбор");
            }
        }
    }
    async #manageUsers() {
        if (!this.#currentUser || this.#currentUser.role !== 'admin') {
            console.log("❌ Только администратор может управлять пользователями");
            return;
        }
        console.log("\n=== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ===");
        console.log("1. Список пользователей");
        console.log("2. Статистика");
        console.log("3. Удалить пользователя");
        const choice = await ask("Выберите действие: ");
        switch (choice) {
            case '1':
                const users = this.#userManager.getAllUsers();
                console.log("\n📋 ПОЛЬЗОВАТЕЛИ:");
                users.forEach(user => console.log(`👤 ${user.username} (${user.role}) - ${user.email}`));
                break;
            case '2':
                const allUsers = this.#userManager.getAllUsers();
                console.log("\n📊 СТАТИСТИКА:");
                allUsers.forEach(user => {
                    const stats = user.stats;
                    console.log(`👤 ${user.username}: Игр:${stats.gamesPlayed} Побед:${stats.wins} Очков:${stats.totalScore} Лучший:${stats.bestScore}`);
                });
                break;
            case '3':
                const usernameToDelete = await ask("Введите логин для удаления: ");
                if (usernameToDelete === this.#currentUser.username) { console.log("❌ Нельзя удалить текущего пользователя"); break; }
                if (this.#userManager.deleteUser(usernameToDelete)) console.log("✅ Пользователь удален");
                else console.log("❌ Пользователь не найден");
                break;
        }
    }
    async #startNewGame() {
        console.log("\n=== НОВАЯ ИГРА ===");
        const categories = ['города', 'животные', 'растения'];
        console.log("Выберите категорию:"); categories.forEach((cat, i) => console.log(`${i+1}. ${cat}`));
        const catChoice = await ask("Ваш выбор: ");
        this.#currentCategory = categories[parseInt(catChoice)-1] || categories[0];
        if (this.#players.length === 0) await this.#setupPlayers();
        else this.#players.forEach(player => player.resetScore());
        this.#isGameActive = true;
        this.#usedWords.clear();
        this.#lastWord = '';
        console.log(`\n🎯 Игра началась! Категория: ${this.#currentCategory}`);
        await this.#gameLoop();
    }
    async #setupPlayers() {
        const playerName = await ask("Введите ваше имя для игры: ");
        this.#players = [new HumanPlayer(playerName, this.#currentUser.email, this.#currentUser.username), new ComputerPlayer()];
        console.log("✅ Игроки добавлены!");
    }
    async #gameLoop() {
        let currentPlayerIndex = 0;
        let skippedTurns = 0;
        while (this.#isGameActive && skippedTurns < 2) {
            const player = this.#players[currentPlayerIndex];
            console.log(`\n--- Ход ${player.name} ---`);
            const word = await player.makeMove({ lastWord: this.#lastWord, usedWords: this.#usedWords, category: this.#currentCategory });
            if (word && this.#validateWord(word, this.#lastWord, this.#usedWords)) {
                console.log(`✅ Правильное слово!`);
                this.#usedWords.add(word.toLowerCase());
                this.#lastWord = word;
                player.addPoint();
                skippedTurns = 0;
            } else {
                console.log(`❌ Неправильное слово!`);
                skippedTurns++;
            }
            console.log("\n📊 Текущий счет:");
            this.#players.forEach(p => console.log(`  ${p.name}: ${p.score} очков`));
            currentPlayerIndex = (currentPlayerIndex + 1) % this.#players.length;
            if (this.#usedWords.size >= 5) {
                this.#isGameActive = false;
                console.log("\n🎯 Игра завершена!");
                this.#showWinner();
                const humanPlayer = this.#players.find(p => p instanceof HumanPlayer);
                if (humanPlayer && humanPlayer.username) {
                    const isWin = humanPlayer.score > this.#players[1].score;
                    this.#userManager.updateUserStats(humanPlayer.username, humanPlayer.score, isWin);
                }
            }
        }
        if (skippedTurns >= 2) {
            console.log("\n💀 Игра завершена - слишком много неправильных ходов!");
            this.#showWinner();
        }
    }
    #validateWord(word, lastWord, usedWords) {
        if (!word || word.length < 2) return false;
        const lowerWord = word.toLowerCase();
        const lowerLastWord = lastWord ? lastWord.toLowerCase() : '';
        const isNewWord = !usedWords.has(lowerWord);
        const isValidSequence = !lastWord || lowerWord[0] === lowerLastWord[lowerLastWord.length - 1];
        return isNewWord && isValidSequence;
    }
    #showWinner() {
        const winner = this.#players.reduce((a, b) => a.score > b.score ? a : b);
        console.log(`🏆 ПОБЕДИТЕЛЬ: ${winner.name} с ${winner.score} очками!`);
        if (this.#currentUser) {
            const stats = this.#userManager.getUserStats(this.#currentUser.username);
            console.log(`\n📈 Ваша статистика: Игр:${stats.gamesPlayed} Побед:${stats.wins} Лучший:${stats.bestScore}`);
        }
    }
    async #managePlayers() {
        console.log("\n=== УПРАВЛЕНИЕ ИГРОКАМИ ===");
        console.log("1. Добавить игрока");
        console.log("2. Удалить игрока");
        console.log("3. Список игроков");
        const choice = await ask("Выберите действие: ");
        switch (choice) {
            case '1':
                const name = await ask("Введите имя: ");
                const email = await ask("Введите email: ");
                this.#players.push(new HumanPlayer(name, email));
                console.log("✅ Игрок добавлен!");
                break;
            case '2':
                if (this.#players.length > 0) {
                    this.#players.forEach((p, i) => console.log(`${i+1}. ${p.name}`));
                    const index = parseInt(await ask("Введите номер: ")) - 1;
                    if (this.#players[index]) {
                        const removed = this.#players.splice(index, 1)[0];
                        console.log(`✅ Игрок ${removed.name} удален`);
                    }
                }
                break;
            case '3':
                this.#players.forEach(p => console.log(`  ${p.name} - ${p.score} очков`));
                break;
        }
    }
    async #showReports() {
        console.log("\n=== ОТЧЕТЫ ===");
        console.log("1. Статистика игры");
        console.log("2. Анализ слов");
        console.log("3. Статистика пользователя");
        const choice = await ask("Выберите отчет: ");
        switch (choice) {
            case '1':
                const stats = this.#generateGameStatsReport();
                console.log("\n📈 СТАТИСТИКА ИГРЫ:");
                console.log(`Игроков: ${stats.totalPlayers} Слов: ${stats.totalWordsUsed} Категория: ${stats.currentCategory} Лучший: ${stats.topPlayer.name} (${stats.topPlayer.score})`);
                break;
            case '2':
                const analysis = this.#generateWordAnalysisReport();
                console.log("\n📊 АНАЛИЗ СЛОВ:");
                console.log(`Всего: ${analysis.totalWords} Средняя длина: ${analysis.averageWordLength.toFixed(2)}`);
                console.log(`Самое длинное: ${analysis.longestWord} Самое короткое: ${analysis.shortestWord}`);
                break;
            case '3':
                if (this.#currentUser) {
                    const userStats = this.#userManager.getUserStats(this.#currentUser.username);
                    console.log("\n👤 СТАТИСТИКА:");
                    console.log(`Игр:${userStats.gamesPlayed} Побед:${userStats.wins} Очков:${userStats.totalScore} Лучший:${userStats.bestScore}`);
                }
                break;
        }
    }
    #generateGameStatsReport() {
        const topPlayer = this.#players.length > 0 ? this.#players.reduce((a, b) => a.score > b.score ? a : b, this.#players[0]) : { name: 'нет', score: 0 };
        return { totalPlayers: this.#players.length, totalWordsUsed: this.#usedWords.size, currentCategory: this.#currentCategory, topPlayer: topPlayer };
    }
    #generateWordAnalysisReport() {
        const words = Array.from(this.#usedWords);
        if (words.length === 0) return { totalWords: 0, averageWordLength: 0, longestWord: 'нет', shortestWord: 'нет' };
        const longest = words.reduce((a, b) => a.length > b.length ? a : b, words[0]);
        const shortest = words.reduce((a, b) => a.length < b.length ? a : b, words[0]);
        return { totalWords: words.length, averageWordLength: words.reduce((sum, word) => sum + word.length, 0) / words.length, longestWord: longest, shortestWord: shortest };
    }
    async #saveGame() {
        const filename = await ask("Имя файла: ") || 'game_save.json';
        try { fs.writeFileSync(filename, JSON.stringify(this.serialize(), null, 2)); console.log(`✅ Сохранено: ${filename}`); }
        catch (error) { console.error('❌ Ошибка:', error.message); }
    }
    async #loadGame() {
        const filename = await ask("Имя файла: ") || 'game_save.json';
        try {
            if (!fs.existsSync(filename)) { console.log('❌ Файл не найден'); return; }
            this.deserialize(JSON.parse(fs.readFileSync(filename, 'utf8')));
            console.log('✅ Загружено');
        } catch (error) { console.error('❌ Ошибка:', error.message); }
    }
    serialize() {
        return {
            players: this.#players.map(p => p.serialize()),
            usedWords: Array.from(this.#usedWords),
            currentCategory: this.#currentCategory,
            lastWord: this.#lastWord,
            isGameActive: this.#isGameActive,
            currentUser: this.#currentUser
        };
    }
    deserialize(data) {
        this.#players = data.players.map(playerData => {
            let player = playerData.type === 'ComputerPlayer' ? new ComputerPlayer() : new HumanPlayer('');
            player.deserialize(playerData);
            return player;
        });
        this.#usedWords = new Set(data.usedWords || []);
        this.#currentCategory = data.currentCategory || '';
        this.#lastWord = data.lastWord || '';
        this.#isGameActive = data.isGameActive || false;
        this.#currentUser = data.currentUser || null;
    }
}

async function main() {
    try { const game = new WordGame(); await game.start(); }
    catch (error) { console.error('❌ Ошибка:', error.message); process.exit(1); }
}

main();