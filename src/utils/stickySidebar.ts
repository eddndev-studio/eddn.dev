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
    const parentColumn = sidebar?.parentElement as HTMLElement; // The <aside> element
    const gridContainer = document.querySelector(containerSelector) as HTMLElement;

    if (!sidebar || !parentColumn || !gridContainer) return;

    // Helper to sync width with parent column
    const syncWidth = () => {
        const width = parentColumn.getBoundingClientRect().width;
        sidebar.style.width = `${width}px`;
    };

    // Resize observer to update width on window resize
    const resizeObserver = new ResizeObserver(() => {
        if (sidebar.style.position === 'fixed' || sidebar.style.position === 'absolute') {
            syncWidth();
        } else {
            sidebar.style.width = ''; // Reset to natural
        }
    });
    resizeObserver.observe(parentColumn);

    const handleScroll = () => {
        // Only run on desktop
        if (window.innerWidth < 1024) {
            resetStyles(sidebar);
            return;
        }

        const containerRect = gridContainer.getBoundingClientRect();
        const sidebarHeight = sidebar.offsetHeight;
        
        // Use parent column for top reference, not the inner element
        // This ensures we know where the "start" line is even when the element is moved
        const startPoint = parentColumn.getBoundingClientRect().top + window.scrollY; 
        const currentScroll = window.scrollY;

        // Calculate limits
        // We want to start sticking when the scroll reaches (StartPoint - HeaderOffset)
        // But simpler: just check container rect top relative to viewport
        
        // Correct Logic:
        // 1. Sidebar Top should be at HeaderOffset.
        // 2. This happens when ParentColumn Top is <= HeaderOffset.
        const parentTop = parentColumn.getBoundingClientRect().top;

        // Stop point: When bottom of sidebar hits bottom of container
        // Container Bottom relative to viewport
        const containerBottom = containerRect.bottom;
        const stopThreshold = sidebarHeight + headerOffset;

        if (parentTop > headerOffset) {
            // SCENARIO 1: Above sticky zone
            resetStyles(sidebar);
        } 
        else if (containerBottom > stopThreshold) {
            // SCENARIO 2: Sticky Zone
            sidebar.style.position = 'fixed';
            sidebar.style.top = `${headerOffset}px`;
            sidebar.style.bottom = 'auto';
            syncWidth(); // Enforce width
        } 
        else {
            // SCENARIO 3: Reached Bottom
            // Position absolute at bottom of the PARENT COLUMN (which stretches to grid height)
            sidebar.style.position = 'absolute';
            sidebar.style.top = 'auto';
            sidebar.style.bottom = '0';
            syncWidth(); // Enforce width
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
