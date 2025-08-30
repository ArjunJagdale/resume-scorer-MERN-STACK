import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse-fixed";
import axios from "axios";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

// POST /api/score-jd
router.post("/score-jd", upload.single("resume"), async (req, res) => {
  try {
    const { jobDescription } = req.body;
    const resumeBuffer = req.file?.buffer;

    if (!jobDescription || !resumeBuffer) {
      return res.status(400).json({ error: "Missing resume or job description" });
    }

    const resumeData = await pdfParse(resumeBuffer);

    const prompt = `
You are a resume scoring assistant.

1. Score the resume against the job description out of 100.
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
${resumeData.text}

Job Description:
${jobDescription}
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawText = response.data.choices[0].message.content || "";

    // ---- Parse response into structured JSON ----
    const scoreMatch = rawText.match(/Score\s*-\s*(\d{1,3})/i);
    const suggestionsMatch = rawText.match(/Suggestions\s*-\s*([\s\S]*)/i);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const suggestions = suggestionsMatch
      ? suggestionsMatch[1].trim().split(/\n+/).map(s => s.replace(/^\d+\]\s*/, "").trim())
      : [];

    // 🔹 Auto-map curated links from suggestions
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
    console.error("Score route error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to process resume", details: err?.message || err });
  }
});

export default router;
