var TypeOtter = (function(obj, $) {

    var imageShiftCount = 0;

    // object: { html, originPage, height }
    var imgQueue = [];

    // State of whether to add all images encountered in dom to the imageQueue.
    var forceImage = false;

    // Count of span elements followed by section title.
    var spanCount = 0;
    var workingOnTitle = false;

    var titleSnapshot = {dom: '', testdom: ''};
    var allowSnapshot = true;

    var skipConditions = false, // Skip special conditions, so we start iterating on the children
        defaultDone = true; // Default value to return when having added all children

    var bestfit = Infinity;
    var bestdom = null;

    var elemsOnPage,
        curPage;

    var minSpanAfterTitle = 0;

    /**
     * Add element to testdom and compare with maxheight.
     * Return true if added else false and revert to previous state.
     */
    function addToPage(element, testdom, totalHeight, pointer) {
        var temp = pointer.html();
        pointer.append(element.clone().wrap('<div>').parent().html());
        var x = testdom.outerHeight(true),
            xx = testdom.html().length;
        if (testdom.outerHeight(true) <= totalHeight) {
            var y = testdom.outerHeight(true),
                yy = testdom.html().length;
            spanCount += TypeOtter.getSpanCount(element);

            if (testdom.height() !== 0) { // Only count added element if element has a height
                elemsOnPage++;
            }
            return true;
        }

        pointer.html(temp); // Revert to before the element was added

        return false;
    }

    /**
     * Force an element to be added to the dom, even if doesn't fit.
     */
    function forceAddElem(elem, testdom, pointer, suppressWarning = false) {
        pointer.append(elem.clone().wrap('<div>').parent().html());
        if (testdom.height() !== 0) { // Only count added element if element has a height
            if (! suppressWarning) {
                console.warn('Careful elements on page %s might exceed the height of the page', curPage);
            }
            elemsOnPage++;
        }
        spanCount += TypeOtter.getSpanCount(elem);
        elem.remove();
    }


    /**
     * Increase origin count for all elements in image queue.
     */
    function increaseImageOrigin() {
        for (var i = 0; i < imgQueue.length; i++) {
            imgQueue[i].origin++;
        }
    }

    /**
     * Add as many images to the dom while staying within dimentions of the page.
     */
    function addQueueElem(dom, testdom, totalHeight, imageDom) {
        increaseImageOrigin();
        imageShiftCount = 0;

        testdom.append('<div class="tex-image-move"></div>');
        var pointer = testdom.find('.tex-image-move');
        for (var i = 0; i < imgQueue.length; i++) {
            var item = imgQueue[i];
            imageDom.html(item.html);
            var imageDomPointer = imageDom.find(':last-child');
            var obj = addToPage(imageDomPointer, testdom, totalHeight, pointer);
            if (obj === null) {
                return null;
            } else {
                imageShiftCount++; // Successfully added, remove element from queue
            }
        }
    }

    /**
     * Check if we hit a section title and take a snapshot of the dom if we're allowed.
     */
    function checkTitleSnapshot(dom, testDom) {
        if (dom.pointer.prop('tagName') === "A" && dom.pointer.attr('href') === "#tex-toc") {
            if (spanCount >= minSpanAfterTitle) {
                allowSnapshot = true;
            }
            if (allowSnapshot) {
                titleSnapshot.testdom = testDom.elem.html();
                titleSnapshot.dom = dom.elem.html();
                allowSnapshot = false;
            }
            spanCount = 0;
        }
    }

    /**
     * If we're in forceImage state, add all images encountered to the image queue.
     */
    function forceAddImage(dom, imageDom) {
        if (forceImage) {
            if (dom.pointer.prop('tagName') === "FIGURE") {
                forceAddElem(dom.pointer, imageDom.elem, imageDom.pointer, true);
                imgQueue.push({
                    html: imageDom.elem.html(),
                    origin: 0,
                });
                imageDom.pointer.html(''); // Remove element from pointer
                return true;
            } else if (dom.pointer.find('figure').length > 0) { // There is a figure inside the element we're working on
                // Check all children instead of adding the whole element.
                skipConditions = true;
                defaultDone = false;
            }
        }
        return false;
    }

    /**
     * Return true if element is a newpage, otherwise return false.
     */
    function isNewPage(dom) {
        if (dom.pointer.hasClass('tex-newpage')) {
            dom.pointer.remove();
            return true;
        }

        return false;
    }

    /**
     * If element doesn't have children and there're no elements on the page, force add the element.
     */
    function forceElementOnEmptyPage(dom, testDom) {
        if (dom.pointer.children().length === 0) {
            if (elemsOnPage === 0) {
                forceAddElem(dom.pointer, testDom.elem, testDom.pointer);
            }
            return true;
        }

        return false;
    }

    /**
     * Check if element is an image and move it to the image queue.
     * This function is only called if the image can't fit on the page.
     */
    function moveImageToQueue(dom, imageDom) {
        if (dom.pointer.prop('tagName') == "FIGURE") {
            forceImage = true;
            forceAddElem(dom.pointer, imageDom.elem, imageDom.pointer, true);
            imgQueue.push({
                html: imageDom.elem.html(),
                origin: 0,
                height: imageDom.elem.height()
            });
            imageDom.pointer.html(''); // Remove element from pointer
            defaultDone = false;
            return true;
        }

        return false;
    }

    /**
     * End page if we can't split the element into children.
     */
    function canSplitElem(dom, testDom) {
        // Elements that should not be recusively checked for children
        var skipElem = ["SPAN", "SCRIPT", "TR", "STYLE", "FIGURE", "IMG"];

        if (skipElem.indexOf(dom.pointer.prop('tagName')) !== -1) {
            if (elemsOnPage === 0) { // Force add element if no other element on page
                forceAddElem(dom.pointer, testDom.elem, testDom.pointer);
            }
            return true;
        }

        return false;
    }

    /**
     * Check if the different dom elements are now empty in which case remove them.
     */
    function removeWrapperIfEmpty(dom, testDom, imageDom) {
        if (testDom.pointer.children().length === 0) { // Remove wrapper if no elements were added to it
            testDom.pointer.remove();
            imageDom.pointer.remove();
        }
        if (dom.pointer.children().length === 0) { // Remove element if no longer has any children
            dom.pointer.remove();
        }

    }

    /**
     * Loop over children of the element remove them appropriately.
     */
    function loopOverChildren(dom, testDom, totalHeight, imageDom) {
        while (dom.pointer.children().length > 0) {
            var childElem = dom.pointer.children(':nth-child(1)');
            var objState = recCheckDom({elem: dom.elem, pointer: childElem}, {elem: testDom.elem, pointer: testDom.pointer}, totalHeight, imageDom);
            if (objState === null) {
                break; // Couldn't add element, exit loop
            } else {
                // If done is true, then not all children were added so we can't remove the parent element
                if (objState.done === true) {
                    break;
                }

                childElem.remove();
            }
        }
    }

    /**
     * Get the wrapper inside dom and move the pointer into that element.
     */
    function movePointer(dom, pointer) {
        var wrapper = dom.pointer.clone().empty(),
            innerWrap = wrapper.wrap('<div>').parent().html();
        pointer.append(innerWrap);
        return pointer.children(':last-child'); // Move pointer to wrap element
    }


    /**
     * Recursive check the specified element's children and add elements until the
     * maxheight is achieved or there's no more elements.
     *
     * @param  {object}        dom         elem        The main element
     *                                     pointer     The element to remove from
     * @param  {object}        testDom     elem        The main element
     *                                     pointer     The element to append on
     * @param  {int}           totalHeight             Max height of the content area of a page
     * @param  {object}        imageDom    elem        The main element
     *                                     pointer     The element to append on
     * @return {bool|null}
     */
    function recCheckDom(dom, testDom, totalHeight, imageDom) {
        skipConditions = false; // Skip special conditions, so we start iterating on the children
        defaultDone = true; // Default value to return when having added all children

        // If we've move one image to the queue, we need to add all following images too.
        if (forceAddImage(dom, imageDom)) {
            return {done: false}; // We added the figure to the imageQueue, but we're not done
        }

        // Check if we encountered a title and snapshot doms if we are allowed.
        checkTitleSnapshot(dom, testDom);

        if (! skipConditions) {
            // Check if entire element can be added to the page.
            if (addToPage(dom.pointer, testDom.elem, totalHeight, testDom.pointer)) { // Element fit
                dom.pointer.empty(); // Remove element from dom
                return {done: false};
            }

            // Remove newpage element and return null to end page.
            if (isNewPage(dom)) {
                return null;
            }

            // Force add element if no other element on page
            if (forceElementOnEmptyPage(dom, testDom)) {
                return null;
            }

            // We know the image couldn't fit, therefore we add image to queue and all following images will also be added.
            if (moveImageToQueue(dom, imageDom)) {
                return {done: false};
            }

            // Check if we're working on an element that can't be split up.
            if (canSplitElem(dom, testDom)) {
                return null;
            }
        }

        // Inner wrap elements and move their pointer.
        testDom.pointer = movePointer(dom, testDom.pointer);
        imageDom.pointer = movePointer(dom, imageDom.pointer);

        // Loop over dom children and add as many as possible.
        loopOverChildren(dom, testDom, totalHeight, imageDom);

        // Remove pointer elements if empty.
        removeWrapperIfEmpty(dom, testDom, imageDom);

        return {done: defaultDone};
    }

    /**
     * Calculate the demerit for doing page break.
     */
    function getPaginationDemerit(remainHeight, offset, options) {
        return options.paginationDemerit(remainHeight, imgQueue, offset, options);
    }

    /**
     * Construct the content of one page.
     */
    function makePage(basePage, dom, testdom, imageDom, options) {
        // Reset values of a new page.
        bestfit = Infinity; // Any solution is better than non
        bestdom = null;
        forceImage = false;
        elemsOnPage = 0;
        allowSnapshot = true;
        var totalHeight = basePage.page.height;

        imageDom.html('');
        addQueueElem(dom, testdom, totalHeight, imageDom);
        imageDom.html('');

        var objFinal = {content: '', remain: ''};

        for (var i = 0; i <= imageShiftCount; i++) {
            var objDom = {elem: dom, pointer: dom};
            var objTestdom = {elem: testdom, pointer: testdom};
            var objImagedom = {elem: imageDom, pointer: imageDom};

            recCheckDom(objDom, objTestdom, totalHeight, objImagedom);
            objFinal.content = objTestdom.elem.html();
            objFinal.remain = objDom.elem.html();

            // Use spanshot dom if title condition is not meet
            if (spanCount < minSpanAfterTitle) {
                dom.html(titleSnapshot.dom); // Set the dom to the snapshot content
                testdom.html(titleSnapshot.testdom);

                objFinal.content = titleSnapshot.testdom;
                objFinal.remain = titleSnapshot.dom;
            }

            // Calculate demerit.
            var remainHeight = totalHeight - testdom.height();
            var demerit = getPaginationDemerit(remainHeight, i, options);

            // Compare demerit with previous best.
            if (demerit < bestfit) {
                bestfit = demerit;
                bestdom = {content: objFinal.content, remain: objFinal.remain, shift: i};
            }

            // Remove last image added from the image queue.
            objTestdom.elem.find('.tex-image-move > :last-child').remove();
        }

        // Remove the number of elements we fit into the dom.
        imgQueue = imgQueue.slice(imageShiftCount - bestdom.shift);

        basePage.content = bestdom.content;
        spanCount = 100; // Set this high, so a page with a single line, but no title is allowed

        return {
            page: basePage,
            remain: bestdom.remain
        };
    }

    /**
     * Convert a dom element to a series of printable pages.
     */
    obj.texify = function(settings, dom) {
        var options = settings.options;
        minSpanAfterTitle = options.minSpanAfterTitle;

        dom.find('.tex-testdom').remove(); // Remove testing element we used to force font load
        var basePage = new TypeOtter.Page();

        dom.wrapInner('<div>');

        // Add styling to get rendering dimensions
        TypeOtter.loadStyleSettings(options);

        var pages = [],
            fullHtml = '',
            clone = dom.find('> div').first().clone(),
            obj = null;
        curPage = 1;

        // Create empty tex-document for testing rendering dimensions.
        dom.append(
            '<div class="tex-document">' +
                '<div class="tex-page" style="height: auto">' +
                    '<div class="tex-content tex-testdom"></div>' +
                '</div>' +
            '</div>'
        );
        var testdom = dom.find('.tex-testdom');

        // Create empty tex-document for testing image contruction.
        dom.append(
            '<div class="tex-document">' +
                '<div class="tex-page" style="height: auto">' +
                    '<div class="tex-content tex-image-dom"></div>' +
                '</div>' +
            '</div>'
        );
        var imageDom = dom.find('.tex-image-dom');

        // Detect rendered size.
        basePage.page.height = testdom.height();

        testdom.css('height', 'auto'); // Set height auto, so content area adjust in size depending on content
        imageDom.css('height', 'auto');

        // Typeset text.
        testdom.html(clone.html());
        TypesetBot.run('.tex-testdom', {dynamicWidth: false}, function () {
            testdom.find('.typeset-hidden').remove();
            clone.html(testdom.html());

            // Check there is still remaining html in the body.
            while (clone.html().trim() !== '') {
                testdom.html(''); // Clear the testdom object
                imageDom.html(''); // Clear the imagedom object

                // Use extend to clone pageSetting obj and remove its reference.
                pages.push(makePage($.extend(true, [], basePage), clone, testdom, imageDom, options));

                var objState = pages[pages.length - 1];

                basePage.number = ++curPage;

                if (objState.remain != null) {
                    clone.html(objState.remain);
                } else {
                    clone.html('');
                }
            }

            // Assemble the pages
            pages.forEach(function (item, index) {
                item.page.total = pages.length;
                var header = TypeOtter.genHeader(options, item.page),
                    footer = TypeOtter.genFooter(options, item.page),
                    page   = TypeOtter.genPage(header, footer, item.page);

                fullHtml += page;
            });

            testdom.parent().remove(); // Remove the test element
            imageDom.parent().remove(); // Remove the image element

            // Wrap document in div, to apply relative styling.
            fullHtml = '<div class="tex-document" zoom="1">' + fullHtml + '</div>';

            // Overwite the body
            dom.html(fullHtml);
        });
    };

    return obj;
}(TypeOtter || {}, jQuery));