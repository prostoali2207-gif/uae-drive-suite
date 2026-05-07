import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const supabase = createClient(
  "https://vlcxjizieelcfunausll.supabase.co", 
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsY3hqaXppZWVsY2Z1bmF1c2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NzgwMDksImV4cCI6MjA5MjE1NDAwOX0.DJbnUr1YG1zJuGjRb96IDTKPYitJbZHykAtO_yX_lg0"
);

app.post("/tally", async (req, res) => {
  console.log("--- НОВЫЙ ЗАПРОС ---");
  const fields = req.body.data?.fields;

  if (!fields) {
    console.log("Ошибка: Tally прислал пустой запрос.");
    return res.status(400).send("No data");
  }

  // Это выведет в терминал список всех ваших полей, как их видит сервер
  fields.forEach(f => console.log(`Поле: "${f.label}" | Значение: "${f.value}"`));

  try {
    // Ищем значения. Если не находим по точному имени, ищем по части слова
    const find = (text) => fields.find(f => f.label.toLowerCase().includes(text.toLowerCase()))?.value;

    const client = {
      full_name: find("name") || "Unknown",
      phone: find("phone"),
      email: find("email"),
      date_of_birth: find("birth") || find("date"),
      license_number: find("license"),
      owner_id: "689eb23a-651f-47cd-bb4e-1166f83039d5" // Ваш ID из базы
    };

    console.log("Пробую вставить:", client);

    const { error } = await supabase.from("clients").insert(client);
    
    if (error) {
      console.error("ОШИБКА БАЗЫ:", error.message);
      return res.status(500).send(error.message);
    }

    console.log("УСПЕХ!");
    res.send("OK");
  } catch (err) {
    console.error("ОШИБКА КОДА:", err.message);
    res.status(500).send(err.message);
  }
});
app.listen(3000, "0.0.0.0", () => {
  console.log("Сервер запущен на порту 3000");
});