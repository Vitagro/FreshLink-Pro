/**
 * Google Sheets Sync — FreshLink Pro
 *
 * Architecture:
 *  - Each Google Sheet has a corresponding Google Apps Script Web App URL
 *  - The app POSTs data (JSON) to these URLs
 *  - The AppScript receives the payload and writes it to the sheet
 *
 * To set up an AppScript Web App:
 *  1. Open the Google Sheet
 *  2. Extensions → Apps Script
 *  3. Paste the template script (see BOGoogleSheets.tsx for the template)
 *  4. Deploy → New deployment → Web App → Execute as "Me" → Anyone can access
 *  5. Copy the Web App URL and paste it into FreshLink Settings → Google Sheets
 */

export type SheetKey = "articles" | "clients" | "stock" | "commandes" | "factures" | "retours"

export interface SheetConfig {
  key: SheetKey
  label: string
  labelAr: string
  description: string
  color: string
  driveFile: string   // filename in Google Drive folder
}

export const SHEET_CONFIGS: SheetConfig[] = [
  {
    key: "articles",
    label: "Base Articles",
    labelAr: "قاعدة المنتجات",
    description: "Catalogue produits : nom, famille, UM, colisage, prix achat, PV, stock",
    color: "bg-emerald-500",
    driveFile: "base articles",
  },
  {
    key: "clients",
    label: "Clients",
    labelAr: "العملاء",
    description: "Fichier clients : nom, secteur, zone, type, rotation, contact, GPS",
    color: "bg-blue-500",
    driveFile: "client",
  },
  {
    key: "stock",
    label: "Stock",
    labelAr: "المخزون",
    description: "Etat du stock : disponible, défectueux, mouvements, date mise à jour",
    color: "bg-orange-500",
    driveFile: "stock",
  },
  {
    key: "commandes",
    label: "Commandes",
    labelAr: "الطلبيات",
    description: "Toutes les commandes : vendeur, client, articles, quantités UM, total, statut",
    color: "bg-violet-500",
    driveFile: "commandes",
  },
  {
    key: "factures",
    label: "Factures / BL",
    labelAr: "الفواتير",
    description: "Bons de livraison et factures : montant, TTC, statut paiement",
    color: "bg-yellow-500",
    driveFile: "factures",
  },
  {
    key: "retours",
    label: "Retours",
    labelAr: "المرتجعات",
    description: "Retours clients : motif, quantité, impact stock, statut validation",
    color: "bg-red-500",
    driveFile: "retours",
  },
]

// ────────────────────────────────────────────────────────────────────────────
// LocalStorage persistence for the 6 endpoint URLs
// ────────────────────────────────────────────────────────────────────────────

const LS_KEY = "fl_gsheets_config"

export type SheetsUrlConfig = Record<SheetKey, string>

export function getSheetsConfig(): SheetsUrlConfig {
  if (typeof window === "undefined") return emptyConfig()
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : emptyConfig()
  } catch {
    return emptyConfig()
  }
}

export function saveSheetsConfig(cfg: SheetsUrlConfig): void {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

function emptyConfig(): SheetsUrlConfig {
  return { articles: "", clients: "", stock: "", commandes: "", factures: "", retours: "" }
}

// ────────────────────────────────────────────────────────────────────────────
// Data serialisers — shape the payload each sheet expects
// ────────────────────────────────────────────────────────────────────────────

import type { Article, Client, Commande, BonLivraison, Retour } from "@/lib/store"

export function serializeArticles(articles: Article[]) {
  return articles.map(a => ({
    id: a.id,
    nom: a.nom,
    nom_ar: a.nomAr,
    famille: a.famille,
    unite: a.unite,
    um: a.um || "",
    colisage_par_um: a.colisageParUM || "",
    stock_disponible: a.stockDisponible,
    stock_defect: a.stockDefect,
    prix_achat: a.prixAchat,
    pv_methode: a.pvMethode,
    pv_valeur: a.pvValeur,
  }))
}

export function serializeClients(clients: Client[]) {
  return clients.map(c => ({
    id: c.id,
    nom: c.nom,
    secteur: c.secteur,
    zone: c.zone,
    type: c.type,
    taille: c.taille || "",
    rotation: c.rotation || "",
    telephone: c.telephone || "",
    email: c.email || "",
    adresse: c.adresse || "",
    gps_lat: c.gpsLat || "",
    gps_lng: c.gpsLng || "",
    prevendeur_id: c.prevendeurId || "",
  }))
}

export function serializeStock(articles: Article[]) {
  return articles.map(a => ({
    id: a.id,
    nom: a.nom,
    famille: a.famille,
    unite: a.unite,
    stock_disponible: a.stockDisponible,
    stock_defect: a.stockDefect,
    date_maj: new Date().toISOString().slice(0, 10),
  }))
}

export function serializeCommandes(commandes: Commande[]) {
  return commandes.flatMap(c =>
    c.lignes.map(l => ({
      commande_id: c.id,
      date: c.date,
      vendeur: c.commercialNom,
      client: c.clientNom,
      secteur: c.secteur,
      zone: c.zone,
      heure_livraison: c.heurelivraison,
      statut: c.statut,
      article: l.articleNom,
      unite: l.unite || "",
      um: l.um || "",
      colisage: l.colisageParUM || "",
      qte_um: l.quantiteUM ?? "",
      qte_base: l.quantite,
      pv: l.prixVente,
      total_ligne: l.total,
      total_commande: c.lignes.reduce((s, ll) => s + ll.total, 0),
    }))
  )
}

export function serializeFactures(bls: BonLivraison[]) {
  return bls.map(b => ({
    id: b.id,
    date: b.date,
    client: b.clientNom,
    secteur: b.secteur,
    livreur: b.livreurNom,
    prevendeur: b.prevendeurNom,
    montant_ht: b.montantTotal,
    tva: b.tva,
    montant_ttc: b.montantTTC,
    statut_paiement: b.statut,
    statut_livraison: b.statutLivraison,
  }))
}

export function serializeRetours(retours: Retour[]) {
  return retours.flatMap(r =>
    r.lignes.map(l => ({
      retour_id: r.id,
      date: r.date,
      livreur: r.livreurNom,
      statut: r.statut,
      valide_par: r.validePar || "",
      client: l.clientNom,
      article: l.articleNom,
      quantite: l.quantite,
      qte_commande: l.quantiteCmd || "",
      motif: l.motif,
      motif_qualite: l.motifQualite ? "oui" : "non",
    }))
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Core push function
// ────────────────────────────────────────────────────────────────────────────

export interface PushResult {
  key: SheetKey
  ok: boolean
  rowsCount: number
  error?: string
}

export async function pushToSheet(
  key: SheetKey,
  rows: Record<string, unknown>[],
  url: string
): Promise<PushResult> {
  if (!url.trim()) {
    return { key, ok: false, rowsCount: 0, error: "URL non configurée" }
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: key, rows, syncedAt: new Date().toISOString() }),
      // no-cors needed for Apps Script deployed as public Web App if CORS not set
      mode: "no-cors",
    })
    // no-cors returns opaque response — we treat it as success if no exception thrown
    return { key, ok: true, rowsCount: rows.length }
  } catch (err) {
    return { key, ok: false, rowsCount: 0, error: String(err) }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AppScript template the user will paste into each sheet
// ────────────────────────────────────────────────────────────────────────────

export const APPS_SCRIPT_TEMPLATE = `
// ============================================================
// FreshLink Pro — AppScript Web App
// ============================================================
// INSTRUCTIONS :
//  1. Ouvrir le fichier Google Sheet cible
//  2. Extensions → Apps Script → coller CE script → Enregistrer (Ctrl+S)
//  3. Deployer → Nouveau deploiement → Type : Application Web
//  4. Executer en tant que : MOI
//     Qui a acces : TOUT LE MONDE (meme anonyme)
//  5. Cliquer "Deployer" → copier l'URL generee
//  6. Coller cette URL dans FreshLink → Parametres → Google Sheets
// ============================================================

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const rows = payload.rows;
    if (!rows || rows.length === 0) {
      return jsonResponse({ result: "no rows" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = payload.sheet || "Data";
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);

    const headers = Object.keys(rows[0]);

    // Write / refresh header row
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Clear previous data rows
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }

    // Write data
    const values = rows.map(function(r) {
      return headers.map(function(h) { return r[h] !== undefined ? r[h] : ""; });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);

    // Auto-resize columns for readability
    sheet.autoResizeColumns(1, headers.length);

    return jsonResponse({ result: "ok", rows: rows.length, sheet: sheetName });
  } catch(err) {
    return jsonResponse({ error: err.toString() });
  }
}

// GET → renvoie une page HTML (evite l'ecran blanc dans le navigateur)
function doGet(e) {
  const html = '<html><body style="font-family:sans-serif;padding:24px">'
    + '<h2 style="color:#0F9D58">FreshLink Pro — AppScript actif</h2>'
    + '<p>Ce script est correctement deploye. Utilisez POST pour synchroniser les donnees.</p>'
    + '<p style="color:#666;font-size:12px">Deploye le : ' + new Date().toLocaleString() + '</p>'
    + '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`.trim()
