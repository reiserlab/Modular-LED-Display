
.PHONY: docs localhost


docs:
	@cd docs && $(MAKE)

localhost:
	bundle exec jekyll serve