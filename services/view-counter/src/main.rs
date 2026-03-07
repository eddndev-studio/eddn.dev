use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::env;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};
use tracing_subscriber;

#[derive(Clone)]
struct AppState {
    redis_client: redis::Client,
}

#[derive(Serialize, Deserialize)]
struct ViewResponse {
    views: u64,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load .env if present
    let _ = dotenvy::dotenv();

    // Setup Redis connection
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let redis_client = redis::Client::open(redis_url.clone())?;
    
    // Verify connection
    let mut con = redis_client.get_multiplexed_async_connection().await?;
    let _: () = redis::cmd("PING").query_async(&mut con).await?;
    info!("Connected to Redis at {}", redis_url);

    let state = AppState { redis_client };

    // Setup CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Setup Router
    let app = Router::new()
        .route("/api/views/{slug}", get(get_views).post(increment_views))
        .layer(cors)
        .with_state(state);

    // Setup server
    let port = env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = SocketAddr::from(([0, 0, 0, 0], port.parse::<u16>().unwrap_or(3001)));
    
    info!("View counter service running on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// Handler to get views
async fn get_views(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<ViewResponse>, (StatusCode, String)> {
    let mut con = state.redis_client.get_multiplexed_async_connection().await.map_err(|e| {
        error!("Redis connection error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
    })?;

    let key = format!("views:{}", slug);
    let views: Option<u64> = con.get(&key).await.map_err(|e| {
        error!("Redis GET error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
    })?;

    Ok(Json(ViewResponse {
        views: views.unwrap_or(0),
    }))
}

// Handler to increment views
async fn increment_views(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<ViewResponse>, (StatusCode, String)> {
    let mut con = state.redis_client.get_multiplexed_async_connection().await.map_err(|e| {
        error!("Redis connection error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
    })?;

    let key = format!("views:{}", slug);
    let views: u64 = con.incr(&key, 1).await.map_err(|e| {
        error!("Redis INCR error: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
    })?;

    Ok(Json(ViewResponse { views }))
}
