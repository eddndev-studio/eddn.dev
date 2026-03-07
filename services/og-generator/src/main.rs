use axum::{
    extract::Query,
    http::{header, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use image::{ImageFormat, Rgba, RgbaImage};
use imageproc::drawing::draw_text_mut;
use ab_glyph::{FontRef, PxScale};
use serde::Deserialize;
use std::{fs, io::Cursor, sync::Arc};
use resvg::{tiny_skia, usvg};

#[derive(Deserialize)]
struct OgParams {
    title: String,
    #[serde(default)]
    tag: String,
    #[serde(default = "default_type")]
    og_type: String,
}

fn default_type() -> String {
    "Article".to_string()
}

// Shared application state to hold the font and template in memory
struct AppState {
    font_bold_data: Vec<u8>,
    template_svg: String,
}

#[tokio::main]
async fn main() {
    // Load assets on startup
    let font_bold_data = fs::read("assets/JetBrainsMono-Bold.ttf").expect("Failed to read font file");
    let template_svg = fs::read_to_string("assets/template.svg").expect("Failed to read SVG template");

    let state = Arc::new(AppState {
        font_bold_data,
        template_svg,
    });

    let app = Router::new()
        .route("/generate", get(generate_og))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3005").await.unwrap();
    println!("OG Generator listening on http://127.0.0.1:3005/generate");
    axum::serve(listener, app).await.unwrap();
}

async fn generate_og(
    Query(params): Query<OgParams>,
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    let font = FontRef::try_from_slice(&state.font_bold_data).unwrap();

    // 1. Render base SVG to pixel buffer
    let mut opt = usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();
    
    let rtree = usvg::Tree::from_str(&state.template_svg, &opt).unwrap();
    let pixmap_size = rtree.size().to_int_size();
    let mut pixmap = tiny_skia::Pixmap::new(pixmap_size.width(), pixmap_size.height()).unwrap();
    resvg::render(&rtree, tiny_skia::Transform::default(), &mut pixmap.as_mut());

    // 2. Convert to Image buffer
    let mut image = RgbaImage::from_raw(pixmap.width(), pixmap.height(), pixmap.data().to_vec()).unwrap();

    // 3. Draw dynamic text
    let title_color = Rgba([15, 23, 42, 255]); // slate-900
    let accent = Rgba([139, 92, 246, 255]); // Brand color (Purple)
    let gray = Rgba([100, 116, 139, 255]); // slate-500

    // Draw Title (wrapping logic simplified for demonstration)
    let title_scale = PxScale::from(80.0);
    let title_x = 80;
    let title_y = 250;
    
    // Draw Title (multi-line rough approximation)
    let max_chars_per_line = 25;
    let words: Vec<&str> = params.title.split_whitespace().collect();
    let mut current_line = String::new();
    let mut y_offset = title_y;
    
    for word in words {
        if current_line.len() + word.len() > max_chars_per_line {
            draw_text_mut(&mut image, title_color, title_x, y_offset, title_scale, &font, &current_line);
            current_line = String::new();
            y_offset += 90;
        }
        current_line.push_str(word);
        current_line.push(' ');
    }
    if !current_line.is_empty() {
        draw_text_mut(&mut image, title_color, title_x, y_offset, title_scale, &font, &current_line);
    }

    // Draw Metadata (Type / Tag)
    let meta_scale = PxScale::from(32.0);
    draw_text_mut(&mut image, gray, 80, 200, meta_scale, &font, &params.og_type.to_uppercase());
    
    if !params.tag.is_empty() {
        let tag_text = format!("#{}", params.tag.to_lowercase());
        // Simple fixed width calculation for the tag placement
        draw_text_mut(&mut image, accent, 80 + (params.og_type.len() as i32 * 20) + 20, 200, meta_scale, &font, &tag_text);
    }

    // 4. Encode to WebP/PNG
    let mut buffer = Cursor::new(Vec::new());
    image.write_to(&mut buffer, ImageFormat::Png).unwrap();

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/png")],
        buffer.into_inner(),
    )
}
