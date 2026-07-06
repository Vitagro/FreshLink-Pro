<?php
/**
 * config/freshlink.php — FreshLink ERP (Laravel)
 * ─────────────────────────────────────────────────────────────
 * Pont entre les variables .env et le WebhookDispatcher.
 *
 * OBLIGATOIRE : sans ce fichier, config('freshlink.xxx')
 * retourne null et les webhooks ne partent pas.
 *
 * Maintenu par : VitaTech — vitatech.vita-core.org
 * ─────────────────────────────────────────────────────────────
 */

return [

    /*
    |----------------------------------------------------------
    | Identité ERP
    |----------------------------------------------------------
    */
    'app_url'  => env('APP_URL', 'https://erp.vita-core.org'),
    'app_name' => env('APP_NAME', 'FreshLink'),

    /*
    |----------------------------------------------------------
    | API Key attendue des clients entrants (Shop → ERP)
    | Vérifiée dans le middleware ApiKeyMiddleware
    |----------------------------------------------------------
    */
    'api_key' => env('FRESHLINK_API_KEY_INCOMING'),  // clé que le Shop doit envoyer

    /*
    |----------------------------------------------------------
    | Webhooks sortants → VitaFresh Shop
    | shop.vita-core.org/api/webhooks/freshlink
    |----------------------------------------------------------
    */
    'webhook_vitafresh_url'    => env('WEBHOOK_VITAFRESH_URL',    'https://shop.vita-core.org/api/webhooks/freshlink'),
    'webhook_vitafresh_secret' => env('WEBHOOK_VITAFRESH_SECRET'),
    'webhook_retry_attempts'   => env('WEBHOOK_RETRY_ATTEMPTS',   3),
    'webhook_timeout'          => env('WEBHOOK_TIMEOUT',          10),

    /*
    |----------------------------------------------------------
    | Webhooks sortants → Dashboard Investisseurs
    | vitafresh.vita-core.org/api/webhooks/erp
    |----------------------------------------------------------
    */
    'webhook_investor_url'    => env('WEBHOOK_INVESTOR_URL',    'https://vitafresh.vita-core.org/api/webhooks/erp'),
    'webhook_investor_secret' => env('WEBHOOK_INVESTOR_SECRET'),

    /*
    |----------------------------------------------------------
    | Clients CORS autorisés (utilisé dans CorsMiddleware)
    | Seuls ces origines peuvent appeler l'API ERP.
    | VitaCore Groupe (maison-mère) NON inclus intentionnellement.
    |----------------------------------------------------------
    */
    'allowed_origins' => explode(',', env('ALLOWED_ORIGINS', 'https://shop.vita-core.org,https://vitafresh.vita-core.org')),

    /*
    |----------------------------------------------------------
    | Sync catalogue → VitaFresh Shop
    |----------------------------------------------------------
    */
    'sync_interval_seconds' => env('FRESHLINK_SYNC_INTERVAL', 60),

    /*
    |----------------------------------------------------------
    | Logistique GPS / Had Soualem
    |----------------------------------------------------------
    */
    'logistics' => [
        'origin_lat'       => env('MARCHE_GROS_HAD_SOUALEM_LAT', 33.3967),
        'origin_lng'       => env('MARCHE_GROS_HAD_SOUALEM_LNG', -7.8567),
        'coverage_radius'  => env('ZONE_LIVRAISON_RADIUS_KM', 150),
    ],

    /*
    |----------------------------------------------------------
    | Recouvrement MAD
    |----------------------------------------------------------
    */
    'recouvrement' => [
        'currency'          => env('CURRENCY', 'MAD'),
        'alerte_seuil_jours'=> env('RECOUVREMENT_ALERTE_SEUIL_JOURS', 30),
        'email'             => env('RECOUVREMENT_EMAIL', 'recouvrement@vita-core.org'),
    ],
];
