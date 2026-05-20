import { useState } from "react";

const Submit = () => {
  const [title, setTitle] =
    useState("");

  const [content, setContent] =
    useState("");

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    try {
      const response =
        await fetch(
          "http://localhost:8787/api/submit",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              title,
              content,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          "投稿失败"
        );
      }

      alert("投稿成功");

      setTitle("");

      setContent("");
    } catch (error) {
      console.error(error);

      alert("投稿失败");
    }
  };

  return (
    <main
      style={{
        padding: "2rem",
      }}
    >
      <h1>故事投稿</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          maxWidth: "700px",
        }}
      >
        <input
          type="text"
          placeholder="标题"
          value={title}
          onChange={(e) =>
            setTitle(e.target.value)
          }
          required
        />

        <textarea
          placeholder="内容"
          rows={10}
          value={content}
          onChange={(e) =>
            setContent(
              e.target.value
            )
          }
          required
        />

        <button type="submit">
          投稿
        </button>
      </form>
    </main>
  );
};

export default Submit;