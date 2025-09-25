const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');
const { parse } = require('node-html-parser');

// Replace with your Telegram bot token
const BOT_TOKEN = process.env.BOT_TOKEN; // Use environment variable on Vercel

const bot = new Telegraf(BOT_TOKEN);

// Handle /start command
bot.start((ctx) => {
    ctx.reply(
        'Welcome! Please select your year:',
        Markup.inlineKeyboard([
            [Markup.button.callback('1', 'year_1')],
            [Markup.button.callback('2', 'year_2')],
            [Markup.button.callback('3', 'year_3')],
            [Markup.button.callback('4', 'year_4')],
        ])
    );
});

// Handle callback queries
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Year selection
    if (data.startsWith('year_')) {
        const year = data.split('_')[1];
        ctx.session = { year }; // save year in session

        // Ask for semester
        await ctx.editMessageText(
            `Selected Year: ${year}\nNow select semester:`,
            Markup.inlineKeyboard([
                [Markup.button.callback('1', 'sem_1')],
                [Markup.button.callback('2', 'sem_2')],
            ])
        );
    }

    // Semester selection
    if (data.startsWith('sem_')) {
        const sem = data.split('_')[1];
        ctx.session.sem = sem;

        await ctx.editMessageText(`Selected Year: ${ctx.session.year}, Semester: ${sem}\nPlease enter your roll number:`);

        // Listen next message for roll number
        bot.on('text', async (ctx2) => {
            const rollno = ctx2.message.text.trim();
            const { year } = ctx.session;
            const sno = (year === '1' && sem === '1') ? '319' : (year === '1' && sem === '2') ? '347' : '';

            if (!sno) return ctx2.reply('Serial number mapping not set for this year/semester.');

            try {
                // Fetch result from DIET portal
                const url = `https://dietportal.in:8443/ExamClick/outside_results_db1.jsp?sno=${sno}&rollno=${rollno}`;
                const response = await fetch(url);
                const html = await response.text();

                // Parse table
                const root = parse(html);
                const table = root.querySelector('.fd-table');
                if (!table) return ctx2.reply('Result not found.');

                const rows = table.querySelectorAll('tr');
                let totalPoints = 0;
                let totalCredits = 0;
                let resultText = `Results for Roll No: ${rollno}\n\n`;

                rows.forEach((row, index) => {
                    if (index === 0) return; // skip header
                    const cells = row.querySelectorAll('td');
                    const subject = cells[2].text;
                    const grade = cells[4].text;
                    const points = parseFloat(cells[3].text);
                    const credits = parseFloat(cells[5].text);

                    if (!isNaN(points) && !isNaN(credits) && credits > 0) {
                        totalPoints += points * credits;
                        totalCredits += credits;
                    }

                    resultText += `${subject} → Grade: ${grade}, Points: ${cells[3].text}, Credits: ${cells[5].text}\n`;
                });

                const sgpa = (totalPoints / totalCredits).toFixed(2);
                resultText += `\nSGPA: ${sgpa}`;

                ctx2.reply(resultText);

            } catch (err) {
                ctx2.reply(`Error fetching result: ${err.message}`);
            }
        });
    }
});

// Vercel serverless function
module.exports = (req, res) => {
    if (req.method === 'POST') {
        bot.handleUpdate(req.body, res)
            .then(() => res.status(200).send('OK'))
            .catch((err) => {
                console.error(err);
                res.status(500).send(err.message);
            });
    } else {
        res.status(200).send('Telegram bot is running!');
    }
};
