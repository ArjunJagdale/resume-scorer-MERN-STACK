import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse-fixed";
import axios from "axios";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// 🔹 Curated list of courses
const courseLinks = {
  html: "https://www.freecodecamp.org/learn/responsive-web-design/",
  css: "https://www.udemy.com/course/css-the-complete-guide/",
  javascript: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/",
  react: "https://react.dev/learn",
  backend: "https://www.coursera.org/specializations/node-js",
  database: "https://www.udemy.com/course/the-complete-sql-bootcamp/",
  deployment: "https://www.coursera.org/learn/devops-basics",
  fullstack: "https://www.theodinproject.com/paths/full-stack-javascript"
};

router.post("/upload", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "No file uploaded. Use field name 'resume'." });
    }

    // Extract text from PDF buffer
    const data = await pdfParse(req.file.buffer);
    const resumeText = data.text || "";

    // 🔹 Prompt for LLM (only score + suggestions)
    const prompt = `
You are a resume scoring assistant.

1. Score the resume out of 100.
2. Provide short improvement suggestions (bullet points).
3. suggest any links to improve gaps in resume. Do not return false links.
4. Extract the key technologies mentioned in the resume.

Format strictly as:

Score - ?/100
Suggestions -
1] point
2] point
3] point

Extracted technologies from job description -
tech1, tech2, tech3

Resume:
${resumeText}
`;

    const payload = {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    };

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawText =
      response.data.choices?.[0]?.message?.content ||
      response.data.choices?.[0]?.text ||
      "";

    // 🔹 Parse structured output
    const scoreMatch = rawText.match(/Score\s*-\s*(\d+)\s*\/100/i);
    const suggestionsMatch = rawText.match(/Suggestions\s*-\s*([\s\S]*)/i);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const suggestions = suggestionsMatch
      ? suggestionsMatch[1]
          .split(/\d+\]|\n/)
          .map((s) => s.trim())
          .filter((s) => s)
      : [];

    // 🔹 Auto-map curated links from keywords
    const support = [];
    suggestions.forEach((s) => {
      Object.entries(courseLinks).forEach(([keyword, link]) => {
        if (s.toLowerCase().includes(keyword) && !support.includes(link)) {
          support.push(link);
        }
      });
    });

    res.json({ score, suggestions, support, raw: rawText });
  } catch (err) {
    console.error("Resume route error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to process resume", details: err?.message || err });
  }
});

export default router;
