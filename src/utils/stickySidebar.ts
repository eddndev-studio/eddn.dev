/**
 * Handles sticky sidebar behavior using JavaScript to bypass CSS overflow limitations.
 * 
 * @param sidebarSelector Selector for the inner sidebar element to be sticky
 * @param containerSelector Selector for the parent grid/container limiting the sticky area
 * @param headerOffset Offset in pixels to account for fixed header (default 128px = 8rem top-32)
 */
export function initStickySidebar(
    sidebarSelector: string, 
    containerSelector: string, 
    headerOffset: number = 120
) {
    const sidebar = document.querySelector(sidebarSelector) as HTMLElement;
    const container = document.querySelector(containerSelector) as HTMLElement;

    if (!sidebar || !container) return;

    // Cache initial width to prevent resizing when switching to fixed
    let sidebarWidth = sidebar.getBoundingClientRect().width;
    
    // Resize observer to update width on window resize
    const resizeObserver = new ResizeObserver(() => {
        // Reset temporarily to measure natural width
        sidebar.style.width = '';
        sidebarWidth = sidebar.getBoundingClientRect().width;
        if (sidebar.style.position === 'fixed') {
            sidebar.style.width = `${sidebarWidth}px`;
        }
    });
    resizeObserver.observe(container);

    const handleScroll = () => {
        // Only run on desktop
        if (window.innerWidth < 1024) {
            resetStyles(sidebar);
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const sidebarHeight = sidebar.offsetHeight;
        const viewportHeight = window.innerHeight;

        // 1. Check if sidebar is taller than container (shouldn't happen usually but safety first)
        if (sidebarHeight >= containerRect.height) {
            resetStyles(sidebar);
            return;
        }

        // 2. Logic:
        // Start: When container top hits the headerOffset
        // Stop: When sidebar bottom hits container bottom
        
        const containerTop = containerRect.top;
        const containerBottom = containerRect.bottom;
        
        // Calculate the limit where sidebar should stop being fixed and become absolute bottom
        // This triggers when the bottom of the fixed sidebar would cross the bottom of the container
        const stopPoint = containerBottom - sidebarHeight - headerOffset;

        if (containerTop > headerOffset) {
            // SCENARIO 1: Above the sticky area
            // Sidebar sits naturally at top
            resetStyles(sidebar);
        } 
        else if (stopPoint > 0) {
            // SCENARIO 2: In the sticky zone
            // Sidebar becomes fixed
            sidebar.style.position = 'fixed';
            sidebar.style.top = `${headerOffset}px`;
            sidebar.style.bottom = 'auto';
            sidebar.style.width = `${sidebarWidth}px`;
        } 
        else {
            // SCENARIO 3: Reached the bottom
            // Sidebar becomes absolute positioned at the bottom of the container relative
            // NOTE: The parent ASIDE needs position: relative for this to work relative to it, 
            // but since we are manipulating the inner DIV, we can just pin it to the bottom of the container logic.
            
            // Actually, simpler approach for "stuck at bottom":
            // TranslateY = (Container Height - Sidebar Height)
            // Or just keep it relative/static but pushed down.
            
            // Let's use absolute positioning relative to the CONTAINER (grid)
            // But container is a Grid... positioning absolute inside grid items can be tricky.
            
            // Safer bet: absolute relative to the ASIDE column which stretches.
            // Let's assume the parent <aside> has `position: relative` (we will enforce this).
            
            sidebar.style.position = 'absolute';
            sidebar.style.top = 'auto';
            sidebar.style.bottom = '0';
            sidebar.style.width = `${sidebarWidth}px`;
        }
    };

    function resetStyles(el: HTMLElement) {
        el.style.position = '';
        el.style.top = '';
        el.style.bottom = '';
        el.style.width = '';
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
    handleScroll();

    // Return cleanup function
    return () => {
        window.removeEventListener('scroll', handleScroll);
        resizeObserver.disconnect();
        resetStyles(sidebar);
    };
}
