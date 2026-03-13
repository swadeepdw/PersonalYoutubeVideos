export default {
  async fetch(request) {
    return new Response(JSON.stringify({ message: "Backend running 🚀" }), {
      headers: { "content-type": "application/json" },
    });
  },
};
