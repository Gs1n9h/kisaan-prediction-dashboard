-- =============================================================================
-- Migration: refresh_daily_demand_summary includes (1) orders created/updated
-- since yesterday, OR (2) orders with delivery_date >= yesterday.
-- =============================================================================
-- So every run refreshes actuals for yesterday and all future delivery dates,
-- and also picks up late updates to past orders.
-- =============================================================================

CREATE OR REPLACE FUNCTION analytics.refresh_daily_demand_summary()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO analytics.daily_demand_summary
        (order_date,
         order_created_date,
         order_id,
         product_id,
         product_short_name,
         source_user_id,
         shipping_name,
         order_type,
         planned_order_quantity,
         actual_order_quantity,
         delivered_order_quantity,
         order_count,
         unique_customers,
         fulfillment_rate)
    WITH ezorder_eventual AS (
        SELECT
            o.order_id::text AS order_id,
            COALESCE(pm.uni_prod_id, p.source_product_id) AS eventual_product_id,
            SUM(COALESCE(h.original_order_qty, oi.ordered_quantity)) AS eventual_order_qty
        FROM ezorder.orders      o
        JOIN ezorder.order_item  oi
          ON o.order_id = oi.order_id
        LEFT JOIN (
            SELECT 
                oih.order_item_id,
                MAX(oih.ordered_quantity) AS original_order_qty
            FROM ezorder.order_item_history oih
            WHERE oih.is_active
            GROUP BY oih.order_item_id
        ) h
          ON h.order_item_id = oi.order_item_id
        LEFT JOIN ezorder.business_product_config bpc
          ON bpc.bus_product_config_id = oi.bus_product_config_id
        LEFT JOIN ezorder.products p
          ON p.product_id = bpc.product_id
        LEFT JOIN analytics.product_mapping pm
          ON pm.related_product_id = p.source_product_id
        WHERE
            o.is_active
            AND oi.is_active
        GROUP BY
            o.order_id::text,
            COALESCE(pm.uni_prod_id, p.source_product_id)
    ),
    beeline_orders AS (
        SELECT 
            o.delivery_date                       AS order_date,
            (o.created_at AT TIME ZONE 'UTC')::date AS order_created_date,
            o.source_order_id::text               AS order_id,
            COALESCE(map_beeline.uni_prod_id, oi.product_id) AS product_id,
            COALESCE(pm.product_short_name, COALESCE(map_beeline.uni_prod_id, oi.product_id)) AS product_short_name,
            o.source_user_id,
            o.shipping_name,
            o.order_type,
            SUM(oi.item_count) AS planned_order_quantity,
            COALESCE(SUM(oibd.delivered_item_count), 0) AS delivered_order_quantity
        FROM beeline_prod.orders o
        JOIN beeline_prod.order_items oi 
          ON o.order_id = oi.order_id
        LEFT JOIN analytics.product_mapping map_beeline
          ON map_beeline.related_product_id = oi.product_id
        LEFT JOIN beeline_prod.product_metadata pm 
          ON COALESCE(map_beeline.uni_prod_id, oi.product_id) = pm.product_id
        LEFT JOIN (
            SELECT order_item_id, SUM(delivered_item_count) AS delivered_item_count
            FROM beeline_prod.order_item_delivered_batches
            WHERE soft_del_flg = 'N'
            GROUP BY order_item_id
        ) oibd ON oi.order_item_id = oibd.order_item_id
        WHERE o.order_status != 'cancelled'
          AND o.soft_del_flg = 'N'
          AND oi.soft_del_flg = 'N'
          AND o.delivery_date IS NOT NULL
          AND ( ( (o.modified_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 1
               OR (o.created_at AT TIME ZONE 'UTC')::date >= CURRENT_DATE - 1 )
             OR o.delivery_date >= CURRENT_DATE - 3 )
        GROUP BY 
            o.delivery_date, 
            (o.created_at AT TIME ZONE 'UTC')::date,
            o.source_order_id::text,
            COALESCE(map_beeline.uni_prod_id, oi.product_id),
            pm.product_short_name,
            o.source_user_id, 
            o.shipping_name,
            o.order_type
    ),
    joined AS (
        SELECT
            b.order_date,
            b.order_created_date,
            b.order_id,
            b.product_id,
            b.product_short_name,
            b.source_user_id,
            b.shipping_name,
            b.order_type,
            COALESCE(e.eventual_order_qty, b.planned_order_quantity) AS actual_order_quantity,
            b.planned_order_quantity,
            b.delivered_order_quantity
        FROM beeline_orders b
        LEFT JOIN ezorder_eventual e
          ON e.order_id = b.order_id
         AND e.eventual_product_id = b.product_id
    )
    SELECT
        j.order_date,
        j.order_created_date,
        j.order_id,
        j.product_id,
        j.product_short_name,
        j.source_user_id,
        j.shipping_name,
        j.order_type,
        j.planned_order_quantity,
        j.actual_order_quantity,
        j.delivered_order_quantity,
        1 AS order_count,
        1 AS unique_customers,
        CASE 
            WHEN j.actual_order_quantity > 0 THEN 
                ROUND((j.delivered_order_quantity::numeric / j.actual_order_quantity) * 100, 2)
            ELSE 100
        END AS fulfillment_rate
    FROM joined j
    ON CONFLICT (order_date, order_id, product_id, source_user_id)
    DO UPDATE SET
        order_created_date        = EXCLUDED.order_created_date,
        planned_order_quantity    = EXCLUDED.planned_order_quantity,
        actual_order_quantity     = EXCLUDED.actual_order_quantity,
        delivered_order_quantity   = EXCLUDED.delivered_order_quantity,
        order_count               = EXCLUDED.order_count,
        unique_customers          = EXCLUDED.unique_customers,
        fulfillment_rate          = EXCLUDED.fulfillment_rate;

    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.daily_demand_summary_product;
END;
$$;
