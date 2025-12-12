const readline = require('readline');
const fs = require('fs');
const crypto = require('crypto');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(q) { return new Promise(r => rl.question(q, r)); }

const GAME_CONFIG = Object.freeze({
    CATEGORIES: ['города', 'животные', 'растения'],
    DIFFICULTY_LEVELS: ['easy', 'medium', 'hard'],
    MIN_WORD_LENGTH: 2,
    MAX_WORDS_FOR_WIN: 5,
    MAX_SKIPPED_TURNS: 2
});

class Validator {
    static validateEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
    static validateUsername(u) { return u && u.length >= 3 && /^[a-zA-Z0-9_]+$/.test(u); }
    static validatePassword(p) { return p && p.length >= 4; }
    static validateWord(w) { return w && w.trim().length >= GAME_CONFIG.MIN_WORD_LENGTH; }
}

class FileManager {
    static saveToFile(f, d) {
        try { fs.writeFileSync(f, JSON.stringify(d, null, 2)); return {success: true}; }
        catch(e) { return {success: false, message: e.message}; }
    }
    static loadFromFile(f) {
        try {
            if (!fs.existsSync(f)) return {success: false, data: null};
            return {success: true, data: JSON.parse(fs.readFileSync(f, 'utf8'))};
        } catch(e) { return {success: false, data: null, message: e.message}; }
    }
    static fileExists(f) { return fs.existsSync(f); }
}

class Serializable {
    constructor() { if (this.constructor === Serializable) throw new Error("Abstract class"); }
    serialize() { throw new Error("Implement serialize"); }
    deserialize() { throw new Error("Implement deserialize"); }
    static deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
}

class UserManager {
    #users = new Map(); #userStats = new Map(); static currentSession = null;
    constructor() { this.loadUsers(); }
    #hashPassword(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
    registerUser(u, p, e = '', r = 'user') {
        if (this.#users.has(u)) return {success: false, message: 'User exists'};
        if (!Validator.validateUsername(u) || !Validator.validatePassword(p)) return {success: false, message: 'Invalid data'};
        const hash = this.#hashPassword(p);
        this.#users.set(u, {passwordHash: hash, email: e, role: r, regDate: new Date().toISOString()});
        this.#userStats.set(u, {gamesPlayed: 0, totalScore: 0, wins: 0, bestScore: 0, wordsUsed: [], categories: {}});
        this.saveUsers();
        return {success: true, message: 'Registered', user: {username: u, role: r, email: e}};
    }
    loginUser(u, p) {
        const user = this.#users.get(u);
        if (!user || user.passwordHash !== this.#hashPassword(p)) return {success: false, message: 'Invalid login'};
        UserManager.currentSession = {username: u, role: user.role, email: user.email};
        return {success: true, message: 'Logged in', user: UserManager.currentSession};
    }
    updateUserStats(u, s, win = false, word = '', cat = '') {
        let stats = this.#userStats.get(u) || {gamesPlayed: 0, totalScore: 0, wins: 0, bestScore: 0, wordsUsed: [], categories: {}};
        if (!stats.wordsUsed) stats.wordsUsed = [];
        if (!stats.categories) stats.categories = {};
        stats.gamesPlayed++; stats.totalScore += s;
        if (win) stats.wins++; if (s > stats.bestScore) stats.bestScore = s;
        if (word) stats.wordsUsed.push(word);
        if (cat) stats.categories[cat] = (stats.categories[cat] || 0) + 1;
        this.#userStats.set(u, stats); this.saveUsers();
    }
    getUserStats(u) {
        const stats = this.#userStats.get(u);
        return stats ? Object.freeze({...stats}) : {gamesPlayed: 0, totalScore: 0, wins: 0, bestScore: 0, wordsUsed: [], categories: {}};
    }
    getAllUsers() {
        return Array.from(this.#users.entries()).map(([u, d]) => ({
            username: u, role: d.role, email: d.email, registrationDate: d.regDate, stats: this.getUserStats(u)
        }));
    }
    deleteUser(u) {
        const deleted = this.#users.delete(u) && this.#userStats.delete(u);
        if (deleted) this.saveUsers(); return deleted;
    }
    searchUsers(t) {
        return this.getAllUsers().filter(u => u.username.includes(t) || u.email.includes(t));
    }
    saveUsers() {
        FileManager.saveToFile('users.json', {
            users: Array.from(this.#users.entries()),
            userStats: Array.from(this.#userStats.entries())
        });
    }
    loadUsers() {
        const r = FileManager.loadFromFile('users.json');
        if (r.success && r.data) {
            this.#users = new Map(r.data.users || []);
            this.#userStats = new Map();
            (r.data.userStats || []).forEach(([u, s]) => {
                this.#userStats.set(u, {
                    gamesPlayed: s.gamesPlayed || 0, totalScore: s.totalScore || 0,
                    wins: s.wins || 0, bestScore: s.bestScore || 0,
                    wordsUsed: s.wordsUsed || [], categories: s.categories || {}
                });
            });
        }
        if (this.#users.size === 0) {
            this.registerUser('admin', 'admin123', 'admin@system.com', 'admin');
            this.registerUser('user', 'user123', 'user@example.com', 'user');
        }
    }
    static isUserLoggedIn() { return UserManager.currentSession !== null; }
    static getCurrentUser() { return UserManager.currentSession; }
    static formatDate(d) {
        const date = new Date(d);
        return date.toLocaleDateString('ru-RU', {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
    }
}

class Player extends Serializable {
    #name; #score; #id;
    constructor(n, id = null) { super(); this.#name = n; this.#score = 0; this.#id = id || Player.generateId(); }
    get name() { return this.#name; } get score() { return this.#score; } get id() { return this.#id; }
    addPoint(p = 1) { this.#score += p; console.log(`${this.#name} +${p} (${this.#score})`); }
    resetScore() { this.#score = 0; }
    async makeMove() { throw new Error("Implement makeMove"); }
    serialize() { return {name: this.#name, score: this.#score, id: this.#id, type: this.constructor.name}; }
    deserialize(d) { this.#name = d.name; this.#score = d.score; this.#id = d.id; }
    static generateId() { return Math.random().toString(36).substr(2, 9); }
    static copyFrom(o) { const p = new this(o.name, o.id); p.#score = o.score; return p; }
}

class ComputerPlayer extends Player {
    #difficulty; #wordDatabase;
    constructor(d = 'medium') {
        super("Компьютер");
        this.#difficulty = d;
        this.#wordDatabase = {
            'города': ['Москва', 'Амстердам', 'Мадрид', 'Лондон', 'Осло', 'Киев', 'Варшава', 'Рим', 'Париж', 'Берлин'],
            'животные': ['Антилопа', 'Баран', 'Носорог', 'Гепард', 'Дельфин', 'Енот', 'Жираф', 'Зебра', 'Игуана', 'Кенгуру'],
            'растения': ['Акация', 'Береза', 'Ромашка', 'Гвоздика', 'Дуб', 'Ель', 'Жасмин', 'Ирис', 'Кедр', 'Липа']
        };
    }
    async makeMove(s) {
        console.log("\nХод компьютера..."); await new Promise(r => setTimeout(r, 800));
        const words = (this.#wordDatabase[s.category] || []).filter(w => {
            const lw = w.toLowerCase(); const llw = s.lastWord ? s.lastWord.toLowerCase() : '';
            return !s.usedWords.has(lw) && (!s.lastWord || lw[0] === llw[llw.length - 1]);
        });
        if (words.length === 0) { console.log("Нет слов"); return null; }
        let selected;
        switch(this.#difficulty) {
            case 'easy': selected = words[0]; break;
            case 'hard': selected = words.reduce((a,b) => a.length > b.length ? a : b, words[0]); break;
            default: selected = words[Math.floor(Math.random() * words.length)];
        }
        console.log(`Компьютер: ${selected}`); return selected;
    }
    serialize() { const d = super.serialize(); d.difficulty = this.#difficulty; return d; }
    deserialize(d) { super.deserialize(d); this.#difficulty = d.difficulty || 'medium'; }
    static initializeWordDatabase() {
        return {
            'города': ['Москва', 'Амстердам', 'Мадрид', 'Лондон', 'Осло', 'Киев', 'Варшава', 'Рим', 'Париж', 'Берлин'],
            'животные': ['Антилопа', 'Баран', 'Носорог', 'Гепард', 'Дельфин', 'Енот', 'Жираф', 'Зебра', 'Игуана', 'Кенгуру'],
            'растения': ['Акация', 'Береза', 'Ромашка', 'Гвоздика', 'Дуб', 'Ель', 'Жасмин', 'Ирис', 'Кедр', 'Липа']
        };
    }
}

class HumanPlayer extends Player {
    #email; #username;
    constructor(n, e = '', u = '') { super(n); this.#email = e; this.#username = u; }
    async makeMove() { return (await ask(`\n${this.name}, слово: `)).trim(); }
    get email() { return this.#email; } get username() { return this.#username; }
    updateProfile(e = '', u = '') {
        if (e && Validator.validateEmail(e)) this.#email = e;
        if (u && Validator.validateUsername(u)) this.#username = u;
    }
    serialize() { const d = super.serialize(); d.email = this.#email; d.username = this.#username; return d; }
    deserialize(d) { super.deserialize(d); this.#email = d.email || ''; this.#username = d.username || ''; }
}

class WordGame extends Serializable {
    #players = []; #usedWords = new Set(); #currentCategory = ''; #lastWord = ''; #isGameActive = false; #currentUser = null; #userManager;
    constructor() { super(); this.#userManager = new UserManager(); }
    static createNewGame() { return new WordGame(); }
    async start() {
        console.clear(); console.log("ИГРА В СЛОВА-L\n" + "=".repeat(40));
        await this.#authMenu(); await this.#mainMenu();
    }
    async #authMenu() {
        while(true) {
            console.log("\n=== АВТОРИЗАЦИЯ ===\n1. Войти\n2. Регистрация\n3. Выход");
            const c = await ask("Выбор: ");
            if (c === '1' && await this.#login()) break;
            else if (c === '2') await this.#register();
            else if (c === '3') { console.log("Выход"); rl.close(); process.exit(0); }
        }
    }
    async #login() {
        const u = await ask("Логин: "), p = await ask("Пароль: ");
        const r = this.#userManager.loginUser(u, p); console.log(r.message);
        if (r.success) { this.#currentUser = r.user; console.log(`${u} (${r.user.role})`); return true; }
        return false;
    }
    async #register() {
        console.log("\n=== РЕГИСТРАЦИЯ ===");
        const u = await ask("Логин: "), p = await ask("Пароль: "), cp = await ask("Повтор: ");
        if (p !== cp) { console.log("Пароли не совпадают"); return; }
        const e = await ask("Email: ");
        const r = this.#userManager.registerUser(u, p, e); console.log(r.message);
        if (r.success) this.#currentUser = this.#userManager.loginUser(u, p).user;
    }
    async #mainMenu() {
        while(true) {
            console.log(`\n=== МЕНЮ (${this.#currentUser.username}) ===`);
            console.log("1. Новая игра\n2. Игроки\n3. Отчеты\n4. Пользователи\n5. Сохранить\n6. Загрузить\n7. Сменить\n0. Выход");
            const c = await ask("Выбор: ");
            if (c === '1') await this.#startNewGame();
            else if (c === '2') await this.#managePlayers();
            else if (c === '3') await this.#showReports();
            else if (c === '4') await this.#manageUsers();
            else if (c === '5') await this.saveGame();
            else if (c === '6') await this.loadGame();
            else if (c === '7') { this.#currentUser = null; await this.#authMenu(); }
            else if (c === '0') { console.log("Выход"); rl.close(); return; }
        }
    }
    async #manageUsers() {
        if (!this.#currentUser || this.#currentUser.role !== 'admin') { console.log("Только админ"); return; }
        console.log("\n=== ПОЛЬЗОВАТЕЛИ ===\n1. Список\n2. Статистика\n3. Удалить");
        const c = await ask("Выбор: ");
        if (c === '1') {
            this.#userManager.getAllUsers().forEach((u,i) => console.log(`${i+1}. ${u.username} (${u.role}) - ${u.email}`));
        } else if (c === '2') {
            this.#userManager.getAllUsers().forEach(u => {
                const s = u.stats; const wr = s.gamesPlayed > 0 ? ((s.wins/s.gamesPlayed)*100).toFixed(1) : 0;
                console.log(`${u.username}: Игр:${s.gamesPlayed} Побед:${s.wins}(${wr}%) Очков:${s.totalScore}`);
            });
        } else if (c === '3') {
            const u = await ask("Удалить логин: ");
            if (u !== this.#currentUser.username) console.log(this.#userManager.deleteUser(u) ? "Удален" : "Не найден");
            else console.log("Нельзя удалить себя");
        }
    }
    async #startNewGame() {
        console.log("\n=== НОВАЯ ИГРА ===");
        console.log("Категория:"); GAME_CONFIG.CATEGORIES.forEach((c,i) => console.log(`${i+1}. ${c}`));
        const cc = parseInt(await ask("Выбор: ")) - 1;
        this.#currentCategory = GAME_CONFIG.CATEGORIES[cc] || GAME_CONFIG.CATEGORIES[0];
        console.log("Сложность:"); GAME_CONFIG.DIFFICULTY_LEVELS.forEach((l,i) => console.log(`${i+1}. ${l}`));
        const dc = parseInt(await ask("Выбор: ")) - 1;
        const diff = ['easy','medium','hard'][dc] || 'medium';
        if (this.#players.length === 0) {
            const n = await ask("Ваше имя: ");
            this.#players = [new HumanPlayer(n, this.#currentUser.email, this.#currentUser.username), new ComputerPlayer(diff)];
        } else this.#players.forEach(p => p.resetScore());
        this.#isGameActive = true; this.#usedWords.clear(); this.#lastWord = '';
        console.log(`\nНачало! Категория: ${this.#currentCategory}, Сложность: ${diff}\n` + "=".repeat(30));
        await this.#gameLoop();
    }
    async #gameLoop() {
        let playerIdx = 0, skipped = 0, round = 1;
        while (this.#isGameActive && skipped < GAME_CONFIG.MAX_SKIPPED_TURNS) {
            console.log(`\nРаунд ${round}\n` + "-".repeat(20));
            const player = this.#players[playerIdx];
            console.log(`Ход: ${player.name}`);
            const word = await player.makeMove({
                lastWord: this.#lastWord,
                usedWords: this.#usedWords,
                category: this.#currentCategory
            });
            if (word && this.#validateWord(word)) {
                console.log(`Правильно: "${word}"`);
                const lw = word.toLowerCase();
                this.#usedWords.add(lw); this.#lastWord = word;
                player.addPoint(Math.min(Math.floor(word.length/2), 3));
                skipped = 0; round++;
                if (this.#usedWords.size >= GAME_CONFIG.MAX_WORDS_FOR_WIN) {
                    this.#isGameActive = false; console.log("\nИгра окончена!");
                    this.#showWinner(); this.#updateStats(); return;
                }
            } else {
                console.log(`"${word || '(пусто)'}" не подходит`);
                if (++skipped >= GAME_CONFIG.MAX_SKIPPED_TURNS) {
                    console.log("\nСлишком много ошибок!"); this.#showWinner(); this.#updateStats(); return;
                }
            }
            console.log(`\nСлов: ${this.#usedWords.size}/${GAME_CONFIG.MAX_WORDS_FOR_WIN}, Последнее: ${this.#lastWord || '-'}`);
            this.#players.forEach(p => console.log(`   ${p.name}: ${p.score}`));
            playerIdx = (playerIdx + 1) % this.#players.length;
            if (player instanceof ComputerPlayer) await new Promise(r => setTimeout(r, 600));
        }
    }
    #validateWord(w) {
        if (!Validator.validateWord(w)) { console.log(`Минимум ${GAME_CONFIG.MIN_WORD_LENGTH} буквы`); return false; }
        const lw = w.toLowerCase(); const llw = this.#lastWord ? this.#lastWord.toLowerCase() : '';
        if (this.#usedWords.has(lw)) { console.log("Уже было"); return false; }
        if (this.#lastWord && lw[0] !== llw[llw.length-1]) { console.log(`Начинается на "${llw[llw.length-1]}"`); return false; }
        return true;
    }
    #showWinner() {
        const w = this.#players.reduce((a,b) => a.score > b.score ? a : b);
        console.log("\n" + "=".repeat(40) + `\nПОБЕДИТЕЛЬ: ${w.name} (${w.score} очков)\n` + "=".repeat(40));
        this.#players.forEach((p,i) => console.log(`${i+1}. ${p.name}: ${p.score}`));
    }
    #updateStats() {
        const hp = this.#players.find(p => p instanceof HumanPlayer);
        if (hp && hp.username) {
            const cp = this.#players.find(p => p instanceof ComputerPlayer);
            this.#userManager.updateUserStats(hp.username, hp.score, cp ? hp.score > cp.score : true, this.#lastWord, this.#currentCategory);
        }
    }
    async #managePlayers() {
        console.log("\n=== ИГРОКИ ===\n1. Добавить\n2. Удалить\n3. Список");
        const c = await ask("Выбор: ");
        if (c === '1') {
            const n = await ask("Имя: "), e = await ask("Email: ");
            if (n.trim()) { this.#players.push(new HumanPlayer(n.trim(), e)); console.log("Добавлен"); }
        } else if (c === '2' && this.#players.length > 0) {
            this.#players.forEach((p,i) => console.log(`${i+1}. ${p.name}`));
            const idx = parseInt(await ask("Номер: ")) - 1;
            if (idx >= 0 && idx < this.#players.length) console.log(`Удален: ${this.#players.splice(idx,1)[0].name}`);
        } else if (c === '3') {
            this.#players.forEach((p,i) => console.log(`${i+1}. ${p.name} - ${p.score}`));
        }
    }
    async #showReports() {
        console.log("\n=== ОТЧЕТЫ ===\n1. Статистика игры\n2. Анализ слов\n3. Статистика пользователя");
        const c = await ask("Выбор: ");
        if (c === '1') {
            const tp = this.#players.length > 0 ? this.#players.reduce((a,b) => a.score > b.score ? a : b, this.#players[0]) : {name:'нет',score:0};
            console.log(`Игроков: ${this.#players.length}, Слов: ${this.#usedWords.size}, Категория: ${this.#currentCategory}, Лучший: ${tp.name} (${tp.score})`);
        } else if (c === '2' && this.#usedWords.size > 0) {
            const words = Array.from(this.#usedWords);
            const l = words.reduce((a,b) => a.length > b.length ? a : b, words[0]);
            const s = words.reduce((a,b) => a.length < b.length ? a : b, words[0]);
            console.log(`Всего: ${words.length}, Ср.длина: ${(words.reduce((sum,w) => sum + w.length,0)/words.length).toFixed(2)}`);
            console.log(`Самое длинное: "${l}" (${l.length}), Самое короткое: "${s}" (${s.length})`);
        } else if (c === '3' && this.#currentUser) {
            const s = this.#userManager.getUserStats(this.#currentUser.username);
            console.log(`Игр:${s.gamesPlayed} Побед:${s.wins} Очков:${s.totalScore} Лучший:${s.bestScore}`);
        }
    }
    async saveGame() {
        const f = await ask("Файл (game_save.json): ") || 'game_save.json';
        const r = FileManager.saveToFile(f, this.serialize());
        console.log(r.success ? `Сохранено: ${f}` : `Ошибка: ${r.message}`);
    }
    async loadGame() {
        const f = await ask("Файл (game_save.json): ") || 'game_save.json';
        const r = FileManager.loadFromFile(f);
        if (r.success) { this.deserialize(r.data); console.log(`Загружено: ${f}`); }
        else console.log("Файл не найден");
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
    try {
        const game = WordGame.createNewGame();
        await game.start();
    } catch(e) {
        console.error('Ошибка:', e.message);
        process.exit(1);
    }
}

if (require.main === module) main();