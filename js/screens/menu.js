import { ic } from '../ui/icons.js';

const item = (to, icon, title, sub, size = 26) => `<button class="menu-item" data-act="go" data-to="${to}"><span class="ico">${ic(icon, size)}</span><span><b>${title}</b><small>${sub}</small></span><span class="go">${ic('caret', 14)}</span></button>`;

export default {
  render() {
    return `<div style="height:22px"></div>
    ${item('#/patrimoine', 'vault', 'Patrimoine', 'Tous vos espaces réunis : patrimoine global et mouvements.')}
    ${item('#/actifs', 'building', 'Actifs', 'Immobilier, or, bourse, crédits')}
    ${item('#/analyse', 'pie', 'Analyses', 'Revenus, dépenses et tendances')}
    ${item('#/prevision', 'trend', 'Prévision', 'Solde projeté des prochains mois')}
    ${item('#/historique', 'history', 'Historique', 'Journal de toutes les transactions')}
    <div class="section-title">Objectifs</div>
    ${item('#/objectifs', 'target', 'Objectifs', 'Épargne et projets')}
    ${item('#/habitudes', 'stars', 'Habitudes', 'Suivez vos bonnes habitudes')}
    ${item('#/assistant', 'chat', 'Assistant IA', 'Posez vos questions sur vos finances')}
    <div class="section-title">Application</div>
    ${item('#/comptes', 'bank', 'Comptes', 'Courant, espèces, épargne, carte')}
    ${item('#/dettes', 'wallet', 'Dettes &amp; créances', 'Ce qu’on vous doit, ce que vous devez')}
    ${item('#/recurrents', 'repeat', 'Récurrents', 'Salaires, loyers, abonnements')}
    ${item('#/parametres', 'gear', 'Paramètres', 'Thème, PIN, sauvegarde, démo')}`;
  },
};
