export default async function handler(request, response) {
  response.status(200).json({ 
    message: 'API works!',
    method: request.method,
    body: request.body 
  });
}
