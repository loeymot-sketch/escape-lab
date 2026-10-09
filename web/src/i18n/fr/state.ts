/** Loading, error and empty panels and the error messages shown to people (ui/state.tsx). */
export default {
  'Your guest session is no longer valid.': 'Votre session invitée n’est plus valide.',
  'You do not have access to this area.': 'Vous n’avez pas accès à cette zone.',
  'This item could not be found.': 'Cet élément est introuvable.',
  'Too many requests.': 'Trop de requêtes.',
  'Try again later.': 'Réessayez plus tard.',
  'Try again in {wait}.': 'Réessayez dans {wait}.',
  'Please wait a moment, then try again.': 'Veuillez patienter un instant, puis réessayez.',
  'The server had a problem. Please retry.': 'Le serveur a rencontré un problème. Veuillez réessayer.',
  'The request was refused. Please check it and try again.': 'La requête a été refusée. Veuillez la vérifier et réessayer.',
  // Fallbacks by status for an empty-bodied refusal (REFUSED)
  'The server did not accept this request. Please check it and try again.': 'Le serveur n’a pas accepté cette requête. Veuillez la vérifier et réessayer.',
  'The request took too long to reach the server. Please try again.': 'La requête a mis trop de temps à atteindre le serveur. Veuillez réessayer.',
  'This conflicts with what the server holds. Reload the page, then try again.': 'Cela entre en conflit avec les données du serveur. Rechargez la page, puis réessayez.',
  'The request was too large for the server to accept.': 'La requête était trop volumineuse pour être acceptée par le serveur.',
  'The server could not process this request. Please check it and try again.': 'Le serveur n’a pas pu traiter cette requête. Veuillez la vérifier et réessayer.',
  // Technical failures
  'The server sent an unexpected response.': 'Le serveur a envoyé une réponse inattendue.',
  'Invalid server {label} payload: {field}.': 'Réponse du serveur invalide ({label})\u00a0: {field}.',
  // Messages of the network client module
  'The Escape Lab server did not answer in time. Check your connection and retry.': 'Le serveur Escape Lab n’a pas répondu à temps. Vérifiez votre connexion, puis réessayez.',
  'Cannot reach the Escape Lab server. Check your connection and retry.': 'Impossible de joindre le serveur Escape Lab. Vérifiez votre connexion, puis réessayez.',
  'The server returned an unreadable response.': 'Le serveur a renvoyé une réponse illisible.',
  'The API address is not configured.': 'L’adresse de l’API n’est pas configurée.',
  // Panels
  'This page could not be loaded': 'Cette page n’a pas pu être chargée',
  'Something went wrong on this screen': 'Un problème est survenu sur cet écran',
  'The screen could not be displayed. Your progress is stored on the server and has not been lost.': 'L’écran n’a pas pu être affiché. Votre progression est enregistrée sur le serveur et n’a pas été perdue.',
  'Try again': 'Réessayer',
  'Reload the laboratory': 'Recharger le laboratoire',
} as Record<string, string>;
